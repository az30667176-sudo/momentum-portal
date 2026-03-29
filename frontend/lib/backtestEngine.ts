/**
 * backtestEngine.ts
 * Pure server-side backtest engine + Supabase data fetching.
 * Imported by /api/run-backtest and /api/run-robustness.
 */

import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import {
  SubReturn, StockReturn,
  DailySubSnapshot, DailyStockSnapshot,
  SubFilter, BacktestConfig, Holding, Trade, ExitReason,
  FilterDetail, FilterConditionDetail, RebalLog,
  PerfMetrics, BacktestResult,
} from './types'

// ── Supabase helpers ──────────────────────────────────────────

function makeClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Fetch sub history using date-window batches instead of OFFSET-based pagination.
// OFFSET queries on large tables cause Supabase free-tier statement timeouts because
// each OFFSET N forces the DB to scan N rows from the start.
// Date-window queries always use OFFSET=0 (fast index seek), eliminating timeouts.
// Each 3-month window ≈ 65 trading days × 155 rows ≈ 10,075 rows — well under 12,000 limit.
async function _fetchSubHistoryRaw(): Promise<DailySubSnapshot[]> {
  const supabase = makeClient()

  // Build 3-month date windows covering the last 3 years.
  // Each window ≈ 65 trading days × 155 rows ≈ 10K rows.
  // statement_timeout is now 30s (set via SQL ALTER ROLE), so each query is safe.
  const now = new Date()
  const cursor = new Date(now)
  cursor.setFullYear(cursor.getFullYear() - 3)
  const windows: { from: string; to: string }[] = []
  while (cursor < now) {
    const from = cursor.toISOString().split('T')[0]
    cursor.setMonth(cursor.getMonth() + 3)
    const to = cursor > now ? now.toISOString().split('T')[0] : cursor.toISOString().split('T')[0]
    windows.push({ from, to })
  }

  // Explicit column list (avoids transferring unused columns like mom_6m, delta_rank etc.)
  const SELECT_SUB = [
    'date','gics_code','rank_today','stock_count',
    'ret_1d','ret_1w','ret_1m','ret_3m','ret_6m','ret_12m','mom_6m',
    'mom_score','obv_trend','rvol','vol_mom','vol_surge_score',
    'sharpe_8w','sortino_8w','volatility_8w','calmar_ratio',
    'information_ratio','momentum_decay_rate',
    'downside_capture','leader_lagger_ratio','cmf',
    'beta','momentum_autocorr','price_trend_r2',
    'price_vs_ma5','price_vs_ma20','price_vs_ma100','price_vs_ma200',
    'breadth_20ma','breadth_50ma','high_proximity',
  ].join(',')

  // Fetch gics universe first (fast, 155 rows)
  const gicsResult = await supabase
    .from('gics_universe')
    .select('gics_code,sector,industry_group,industry,sub_industry,etf_proxy')

  const gicsMap = new Map<string, SubReturn['gics_universe']>(
    (gicsResult.data ?? []).map((g: Record<string, unknown>) => [
      g.gics_code as string, g as unknown as SubReturn['gics_universe']
    ])
  )

  // Fetch 3 windows in parallel (OFFSET=0, ~10K rows each, <5s per query).
  // statement_timeout=30s (set via ALTER ROLE) keeps this safe.
  const PARALLEL = 3
  const allSubRows: Record<string, unknown>[] = []

  for (let i = 0; i < windows.length; i += PARALLEL) {
    const batch = windows.slice(i, i + PARALLEL)
    const results = await Promise.all(
      batch.map(w =>
        supabase
          .from('daily_sub_returns')
          .select(SELECT_SUB)
          .gte('date', w.from)
          .lt('date', w.to)
          .order('date', { ascending: true })
          .order('gics_code', { ascending: true })
          .range(0, 11999)
      )
    )
    for (const chunk of results) {
      if (chunk.error) throw new Error(`sub range query failed: ${chunk.error.message}`)
      allSubRows.push(...(chunk.data as Record<string, unknown>[]))
    }
  }

  const subByDate = new Map<string, SubReturn[]>()
  for (const row of allSubRows) {
      const date = String(row.date).slice(0, 10)
      if (!subByDate.has(date)) subByDate.set(date, [])
      // Spread all numeric columns from the row, then attach gics_universe.
      // Using spread ensures future indicator columns (pvt_slope, mfi, cmf, etc.)
      // are included without needing to enumerate them explicitly.
      const numericFields: Record<string, number | null> = {}
      for (const [k, v] of Object.entries(row)) {
        if (k === 'date' || k === 'gics_code') continue
        numericFields[k] = v != null ? Number(v) : null
      }
      subByDate.get(date)!.push({
        ...numericFields,
        date,
        gics_code: row.gics_code as string,
        gics_universe: gicsMap.get(row.gics_code as string),
      } as unknown as SubReturn)
  }

  const subHistory: DailySubSnapshot[] = Array.from(subByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, subs]) => ({ date, subs }))

  if (subHistory.length < 20) {
    throw new Error(`sub data only ${subHistory.length} days — DB may be mid-write`)
  }
  return subHistory
}

// Cached sub history — 5-minute cache, v5 key (busts cache after date-window refactor)
export const fetchSubHistory = unstable_cache(
  _fetchSubHistoryRaw,
  ['sub-history-v5'],
  { revalidate: 300 }
)

// Collect the dates on which rebalancing occurs (pure function, no DB)
export function collectRebalDates(config: BacktestConfig, subHistory: DailySubSnapshot[]): string[] {
  const dates: string[] = []
  let nextRebalDay = 0
  for (let day = 0; day < subHistory.length; day++) {
    if (day >= nextRebalDay) {
      dates.push(subHistory[day].date)
      nextRebalDay = day + config.rebalPeriod
    }
  }
  return dates
}

// Fetch stock data for rebalancing dates using date-batch queries (no OFFSET).
// Splitting dates into batches of 10 keeps each query to ~15K rows with OFFSET=0,
// eliminating the statement timeout caused by high-OFFSET scans.
export async function fetchStockHistoryForDates(dates: string[]): Promise<DailyStockSnapshot[]> {
  if (dates.length === 0) return []
  const supabase = makeClient()

  // Split rebal dates into batches of 10 (10 dates × ~1500 stocks ≈ 15K rows each),
  // 3 batches in parallel. statement_timeout=30s keeps each query safe.
  const DATE_BATCH = 10
  const PARALLEL = 3
  const dateBatches: string[][] = []
  for (let i = 0; i < dates.length; i += DATE_BATCH) {
    dateBatches.push(dates.slice(i, i + DATE_BATCH))
  }

  const allStockRows: Record<string, unknown>[] = []

  for (let i = 0; i < dateBatches.length; i += PARALLEL) {
    const round = dateBatches.slice(i, i + PARALLEL)
    const results = await Promise.all(
      round.map(batchDates =>
        supabase
          .from('daily_stock_returns')
          .select('date,ticker,gics_code,ret_1d,ret_1w,ret_1m,ret_3m,mom_score,rank_in_sub,rvol,obv_trend')
          .in('date', batchDates)
          .order('date', { ascending: true })
          .order('ticker', { ascending: true })
          .range(0, 15999)
      )
    )
    for (const chunk of results) {
      if (chunk.error) { console.error('stock range error:', chunk.error.message); continue }
      allStockRows.push(...(chunk.data as Record<string, unknown>[]))
    }
  }

  const stockByDate = new Map<string, StockReturn[]>()
  for (const row of allStockRows) {
    const date = String(row.date).slice(0, 10)
    if (!stockByDate.has(date)) stockByDate.set(date, [])
    stockByDate.get(date)!.push({
      date,
      ticker: row.ticker as string,
      gics_code: row.gics_code as string,
      ret_1d: row.ret_1d != null ? Number(row.ret_1d) : null,
      ret_1w: row.ret_1w != null ? Number(row.ret_1w) : null,
      ret_1m: row.ret_1m != null ? Number(row.ret_1m) : null,
      ret_3m: row.ret_3m != null ? Number(row.ret_3m) : null,
      mom_score: row.mom_score != null ? Number(row.mom_score) : null,
      rank_in_sub: row.rank_in_sub != null ? Number(row.rank_in_sub) : null,
      rvol: row.rvol != null ? Number(row.rvol) : null,
      obv_trend: row.obv_trend != null ? Number(row.obv_trend) : null,
    })
  }

  return Array.from(stockByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, stocks]) => ({ date, stocks }))
}

// Backward-compatible wrapper for run-robustness (stock data not needed for param sweep)
export async function fetchBacktestData(): Promise<{
  subHistory: DailySubSnapshot[]
  stockHistory: DailyStockSnapshot[]
}> {
  const subHistory = await fetchSubHistory()
  return { subHistory, stockHistory: [] }
}

// ── Engine helpers ────────────────────────────────────────────

export function checkFilter(
  filter: SubFilter,
  curr: SubReturn | undefined,
  prev: SubReturn | undefined
): boolean {
  if (!curr) return false
  const currVal = curr[filter.indicator as keyof SubReturn] as number | null | undefined
  const prevVal = prev ? prev[filter.indicator as keyof SubReturn] as number | null | undefined : undefined
  if (currVal === null || currVal === undefined) return false

  if (filter.type === 'static') {
    if (filter.op === '>=') return currVal >= filter.value
    if (filter.op === '<=') return currVal <= filter.value
    if (filter.op === 'between')
      return currVal >= filter.value && currVal <= (filter.value2 ?? Infinity)
  }
  if (filter.type === 'crossover') {
    if (prevVal === null || prevVal === undefined) return false
    if (filter.direction === 'neg_to_pos') return prevVal < 0 && currVal > 0
    if (filter.direction === 'pos_to_neg') return prevVal > 0 && currVal < 0
  }
  if (filter.type === 'delta') {
    if (prevVal === null || prevVal === undefined) return false
    const delta = currVal - prevVal
    if (filter.op === 'rise') return delta >= filter.value
    if (filter.op === 'fall') return delta <= -filter.value
  }
  if (filter.type === 'rank_break') {
    const currRank = curr.rank_today
    const prevRank = prev?.rank_today
    if (!currRank) return false
    if (filter.mode === 'top_pct')
      return currRank <= Math.round(145 * filter.value / 100)
    if (filter.mode === 'improve')
      return prevRank != null && (prevRank - currRank) >= filter.value
  }
  return false
}

function applyTwoCaps(
  weights: number[],
  gicsCodes: string[],
  maxStockPct: number,
  maxSubPct: number
): number[] {
  const maxStock = maxStockPct / 100
  const maxSub = maxSubPct / 100

  // Step 1: cap each individual stock
  let w = weights.map(v => Math.min(v, maxStock))

  // Step 2: cap sub-industry totals
  const subGroups = new Map<string, number[]>()
  gicsCodes.forEach((code, i) => {
    if (!subGroups.has(code)) subGroups.set(code, [])
    subGroups.get(code)!.push(i)
  })
  for (const [, indices] of subGroups) {
    const subTotal = indices.reduce((sum, i) => sum + w[i], 0)
    if (subTotal > maxSub) {
      const scale = maxSub / subTotal
      indices.forEach(i => { w[i] *= scale })
    }
  }

  // Renormalize
  const total = w.reduce((a, b) => a + b, 0)
  return total > 0 ? w.map(v => v / total) : w
}

function calcWeights(
  tickers: string[],
  gicsCodes: string[],
  subs: SubReturn[],
  stockMap: Map<string, StockReturn>,
  mode: BacktestConfig['weightMode'],
  maxStockWeight: number,
  maxSubWeight: number
): number[] {
  const n = tickers.length
  if (n === 0) return []

  let raw: number[]
  if (mode === 'momentum') {
    const scores = tickers.map(t => Math.max(stockMap.get(t)?.mom_score ?? 50, 0.001))
    const total = scores.reduce((a, b) => a + b, 0)
    raw = scores.map(s => s / total)
  } else if (mode === 'volatility') {
    const vols = tickers.map(t => {
      const st = stockMap.get(t)
      const sub = subs.find(s => s.gics_code === (st?.gics_code ?? t))
      return Math.max(sub?.volatility_8w ?? 15, 0.001)
    })
    const invVols = vols.map(v => 1 / v)
    const total = invVols.reduce((a, b) => a + b, 0)
    raw = invVols.map(iv => iv / total)
  } else {
    raw = Array(n).fill(1 / n)
  }

  return applyTwoCaps(raw, gicsCodes, maxStockWeight, maxSubWeight)
}

function calcPerf(
  dailyRets: number[],
  eq: number[],
  start: number,
  end: number
): PerfMetrics {
  const r = dailyRets.slice(start, end)
  const e = eq.slice(start, end)
  const n = r.length
  if (n < 2) return { annRet: 0, sharpe: 0, sortino: 0, mdd: 0, wr: 0 }

  const mn = r.reduce((a, b) => a + b, 0) / n
  const variance = r.reduce((a, b) => a + (b - mn) ** 2, 0) / n
  const std = Math.sqrt(variance) || 0.001
  const negR = r.filter(x => x < 0)
  const ds = negR.length
    ? Math.sqrt(negR.reduce((a, b) => a + b * b, 0) / negR.length)
    : std
  const annRet = (Math.pow(e[n - 1] / e[0], 252 / n) - 1) * 100
  const sharpe = (mn / std) * Math.sqrt(252)
  const sortino = (mn / ds) * Math.sqrt(252)

  let pk = e[0], mdd = 0
  e.forEach(v => {
    if (v > pk) pk = v
    const d = (pk - v) / pk * 100
    if (d > mdd) mdd = d
  })

  const wr = Math.round(r.filter(x => x > 0).length / n * 100)
  return {
    annRet: parseFloat(annRet.toFixed(2)),
    sharpe: parseFloat(sharpe.toFixed(2)),
    sortino: parseFloat(sortino.toFixed(2)),
    mdd: parseFloat(mdd.toFixed(2)),
    wr,
  }
}

// ── Main engine ───────────────────────────────────────────────

export function runBacktestSync(
  config: BacktestConfig,
  subHistory: DailySubSnapshot[],
  stockHistory: DailyStockSnapshot[]
): BacktestResult {
  const N = subHistory.length
  const isSplitDay = Math.floor(N * config.isSplitPct / 100)
  const stockDataAvailable = stockHistory.length > 0 && stockHistory[0]?.stocks.length > 0

  const equityCurve: number[] = [1]
  const drawdownCurve: number[] = [0]
  const dailyReturns: number[] = []
  const spyCurve: number[] = [1]
  const ewCurve: number[] = [1]
  const dates: string[] = []
  const rebalLogs: RebalLog[] = []

  let holdings: Holding[] = []
  let pendingOrders: { ticker: string; gics_code: string; subName: string; weight: number; rebalLogIdx: number }[] = []
  let equity = 1
  let spyEquity = 1
  let ewEquity = 1
  let nextRebalDay = 0
  let peakEquity = 1
  let totalExitCount = 0
  const tradeHistory: Trade[] = []
  let stopExitsSinceLastRebal = 0

  // Build stock map indexed by date
  const stockByDate = new Map<string, Map<string, StockReturn>>()
  for (const snap of stockHistory) {
    const m = new Map<string, StockReturn>()
    for (const s of snap.stocks) {
      m.set(s.ticker, s)
      m.set(s.gics_code, s)
    }
    stockByDate.set(snap.date, m)
  }

  for (let day = 0; day < N; day++) {
    const snap = subHistory[day]
    const date = snap.date
    dates.push(date)
    const prevSnap = day >= config.rebalPeriod ? subHistory[day - config.rebalPeriod] : null
    const isOOS = day >= isSplitDay

    // SPY proxy: average of all sub ret_1d
    const allRets = snap.subs.map(s => s.ret_1d ?? 0)
    const avgRet = allRets.length > 0 ? allRets.reduce((a, b) => a + b, 0) / allRets.length : 0
    spyEquity *= (1 + avgRet / 100)
    spyCurve.push(spyEquity)

    // Equal-weight benchmark: top 20 by mom_score
    const sorted20 = [...snap.subs].sort((a, b) => (b.mom_score ?? 0) - (a.mom_score ?? 0)).slice(0, 20)
    const ew20Ret = sorted20.length > 0
      ? sorted20.reduce((a, s) => a + (s.ret_1d ?? 0), 0) / sorted20.length
      : 0
    ewEquity *= (1 + ew20Ret / 100)
    ewCurve.push(ewEquity)

    // Execute pending orders
    if (pendingOrders.length > 0) {
      holdings = pendingOrders.map(o => ({
        ticker: o.ticker,
        gics_code: o.gics_code,
        subName: o.subName,
        entryDay: day,
        entryDate: date,
        entryEquity: equity * o.weight,
        peakCumReturn: 0,
        cumReturn: 0,
        exitIndex: 100,
        weight: o.weight,
        rebalLogIdx: o.rebalLogIdx,
      }))
      pendingOrders = []
    }

    // Daily P&L
    let portRet = 0
    const exitedToday: string[] = []

    if (holdings.length > 0) {
      const equalW = 1 / holdings.length
      const updatedHoldings: Holding[] = []
      const dayStockMap = stockByDate.get(date) ?? new Map()

      for (const h of holdings) {
        const sub = snap.subs.find(s => s.gics_code === h.gics_code)
        // Use actual stock ret_1d on rebal dates (when stock data is available);
        // fall back to sub-industry return on non-rebal days
        const stock = dayStockMap.get(h.ticker)
        const dailyRet = stock?.ret_1d != null
          ? stock.ret_1d / 100
          : (sub?.ret_1d ?? 0) / 100
        h.cumReturn = (1 + h.cumReturn / 100) * (1 + dailyRet) * 100 - 100
        h.peakCumReturn = Math.max(h.peakCumReturn, h.cumReturn)
        h.exitIndex = (h.exitIndex ?? 100) * (1 + dailyRet)

        let shouldExit = false
        let exitReason: ExitReason = 'rebal'
        if (config.stopLoss < 0 && h.cumReturn <= config.stopLoss) { shouldExit = true; exitReason = 'stop_loss' }
        if (!shouldExit && config.trailingStop > 0 && h.peakCumReturn - h.cumReturn >= config.trailingStop) { shouldExit = true; exitReason = 'trailing_stop' }
        if (!shouldExit && config.takeProfit > 0 && h.cumReturn >= config.takeProfit) { shouldExit = true; exitReason = 'take_profit' }
        if (!shouldExit && config.timeStop > 0 && (day - h.entryDay) >= config.timeStop * 5) { shouldExit = true; exitReason = 'time_stop' }
        if (!shouldExit && config.exitFilters.length > 0 && sub) {
          const prevSub = prevSnap?.subs.find(s => s.gics_code === h.gics_code)
          if (config.exitFilters.every(f => checkFilter(f, sub, prevSub))) { shouldExit = true; exitReason = 'signal' }
        }

        if (shouldExit) {
          exitedToday.push(h.subName)
          totalExitCount++
          stopExitsSinceLastRebal++
          portRet += equalW * (h.cumReturn / 100) - Math.abs(h.cumReturn * equalW) * config.tradingCost / 100
          tradeHistory.push({
            ticker: h.ticker,
            gics_code: h.gics_code,
            subName: h.subName,
            entryDate: h.entryDate,
            exitDate: date,
            holdingDays: day - h.entryDay,
            weight: h.weight ?? equalW,
            pnlPct: parseFloat((h.exitIndex - 100).toFixed(2)),
            exitReason,
            rebalLogIdx: h.rebalLogIdx,
          })
        } else {
          portRet += equalW * dailyRet
          updatedHoldings.push(h)
        }
      }
      holdings = updatedHoldings
    }

    equity *= (1 + portRet)
    if (equity > peakEquity) peakEquity = equity
    const dd = peakEquity > 0 ? (peakEquity - equity) / peakEquity * 100 : 0

    equityCurve.push(equity)
    drawdownCurve.push(dd)
    dailyReturns.push(portRet * 100)

    // Rebalance
    if (day >= nextRebalDay) {
      nextRebalDay = day + config.rebalPeriod

      const filterDetails: FilterDetail[] = []
      const passedSubs: SubReturn[] = []

      for (const sub of snap.subs) {
        const prevSub = prevSnap?.subs.find(s => s.gics_code === sub.gics_code)
        const subName = sub.gics_universe?.sub_industry ?? sub.gics_code

        const conditions: FilterConditionDetail[] = config.subFilters.map(f => {
          const currVal = sub[f.indicator as keyof SubReturn] as number | null | undefined
          const prevVal = prevSub ? prevSub[f.indicator as keyof SubReturn] as number | null | undefined : undefined
          return {
            indicator: f.indicator,
            type: f.type,
            currVal: currVal ?? null,
            prevVal: prevVal ?? null,
            passed: checkFilter(f, sub, prevSub),
          }
        })
        const passed = conditions.length === 0 || conditions.every(c => c.passed)
        filterDetails.push({ subName, gics_code: sub.gics_code, passed, conditions })
        if (passed) passedSubs.push(sub)
      }

      const ranked = [...passedSubs].sort((a, b) => {
        const av = (a[config.rankBy as keyof SubReturn] as number | null) ?? 0
        const bv = (b[config.rankBy as keyof SubReturn] as number | null) ?? 0
        return config.rankDir === 'desc' ? bv - av : av - bv
      })
      const selectedSubs = ranked.slice(0, config.topN)
      const selectedCodes = new Set(selectedSubs.map(s => s.gics_code))
      const currentHoldingCodes = new Set(holdings.map(h => h.gics_code))
      const finalCodes = new Set<string>(selectedCodes)

      for (const holdCode of currentHoldingCodes) {
        const rankIdx = ranked.findIndex(s => s.gics_code === holdCode)
        if (rankIdx >= 0 && rankIdx < config.topN + config.bufferRule) finalCodes.add(holdCode)
      }

      const entering = selectedSubs
        .filter(s => !currentHoldingCodes.has(s.gics_code))
        .map(s => s.gics_universe?.sub_industry ?? s.gics_code)
      const exiting = [...currentHoldingCodes]
        .filter(code => !finalCodes.has(code))
        .map(code => snap.subs.find(s => s.gics_code === code)?.gics_universe?.sub_industry ?? code)

      const dayStockMap = stockByDate.get(date) ?? new Map()
      // Only do stock selection if THIS date has stock data (last 50 rebal dates);
      // older dates fall back to sub-level to avoid zero-holding periods.
      const hasStockDataToday = dayStockMap.size > 0
      const newTickers: { ticker: string; gics_code: string; subName: string }[] = []

      for (const sub of selectedSubs) {
        if (!finalCodes.has(sub.gics_code)) continue
        const subName = sub.gics_universe?.sub_industry ?? sub.gics_code

        if (hasStockDataToday) {
          const subStocks: StockReturn[] = []
          for (const [k, st] of dayStockMap) {
            // Skip gics_code-keyed entries (each stock is inserted twice: by ticker and by gics_code)
            if (k === st.gics_code) continue
            if (st.gics_code === sub.gics_code) subStocks.push(st)
          }
          subStocks
            .sort((a, b) => {
              const av = (a[config.stockRankBy as keyof StockReturn] as number | null) ?? 0
              const bv = (b[config.stockRankBy as keyof StockReturn] as number | null) ?? 0
              return bv - av
            })
            .slice(0, config.stocksPerSub)
            .forEach(st => newTickers.push({ ticker: st.ticker, gics_code: sub.gics_code, subName }))
        } else {
          newTickers.push({ ticker: sub.gics_code, gics_code: sub.gics_code, subName })
        }
      }

      const newCodes = new Set(newTickers.map(t => t.ticker))
      const oldCodes = new Set(holdings.map(h => h.ticker))
      const turnovers = [...newCodes].filter(c => !oldCodes.has(c)).length
        + [...oldCodes].filter(c => !newCodes.has(c)).length
      equity *= (1 - (turnovers / Math.max(newTickers.length + holdings.length, 1)) * config.tradingCost / 100)

      // Record rebal exits for current holdings
      const rebalLogIdx = rebalLogs.length
      for (const h of holdings) {
        tradeHistory.push({
          ticker: h.ticker,
          gics_code: h.gics_code,
          subName: h.subName,
          entryDate: h.entryDate,
          exitDate: date,
          holdingDays: day - h.entryDay,
          weight: h.weight ?? (holdings.length > 0 ? 1 / holdings.length : 0),
          pnlPct: parseFloat(((h.exitIndex ?? 100) - 100).toFixed(2)),
          exitReason: 'rebal',
          rebalLogIdx: h.rebalLogIdx,
        })
      }
      const stockExitsCount = holdings.length + stopExitsSinceLastRebal
      stopExitsSinceLastRebal = 0

      if (newTickers.length > 0) {
        const tickerIds = newTickers.map(t => t.ticker)
        const tickerGics = newTickers.map(t => t.gics_code)
        const weights = calcWeights(tickerIds, tickerGics, snap.subs, dayStockMap, config.weightMode, config.maxStockWeight, config.maxSubWeight)
        pendingOrders = newTickers.map((t, wi) => ({ ...t, weight: weights[wi] ?? 1 / newTickers.length, rebalLogIdx }))
      }
      holdings = []

      rebalLogs.push({
        day, date, isOOS,
        selectedSubs: selectedSubs.map(s => s.gics_universe?.sub_industry ?? s.gics_code),
        entering, exiting,
        holdingCount: newTickers.length,
        exitedToday, filterDetails,
        stockEntriesCount: newTickers.length,
        stockExitsCount,
      })
    } else if (exitedToday.length > 0 && rebalLogs.length > 0) {
      rebalLogs[rebalLogs.length - 1].exitedToday.push(...exitedToday)
    }
  }

  // Close any still-open holdings at end of backtest
  if (holdings.length > 0) {
    const lastDate = subHistory[N - 1]?.date ?? ''
    for (const h of holdings) {
      tradeHistory.push({
        ticker: h.ticker,
        gics_code: h.gics_code,
        subName: h.subName,
        entryDate: h.entryDate,
        exitDate: lastDate,
        holdingDays: N - 1 - h.entryDay,
        weight: h.weight ?? (holdings.length > 0 ? 1 / holdings.length : 0),
        pnlPct: parseFloat(((h.exitIndex ?? 100) - 100).toFixed(2)),
        exitReason: 'rebal',
        rebalLogIdx: h.rebalLogIdx,
      })
    }
  }

  return {
    equityCurve, drawdownCurve, dailyReturns, spyCurve, ewCurve, dates,
    rebalLogs, tradeHistory,
    fullPerf: calcPerf(dailyReturns, equityCurve, 0, dailyReturns.length),
    isPerf: calcPerf(dailyReturns, equityCurve, 0, isSplitDay),
    oosPerf: calcPerf(dailyReturns, equityCurve, isSplitDay, dailyReturns.length),
    totalRebalCount: rebalLogs.length,
    totalExitCount,
    stockDataAvailable,
    isSplitDay,
  }
}

// ── Dry-run scan ──────────────────────────────────────────────
// Quickly finds all sub-industries selected over the full history
// (used to determine which stocks to fetch before a full backtest)

export function dryRunScan(
  config: BacktestConfig,
  subHistory: DailySubSnapshot[]
): string[] {
  const N = subHistory.length
  const selected = new Set<string>()
  let nextRebalDay = 0

  for (let day = 0; day < N; day++) {
    if (day < nextRebalDay) continue
    nextRebalDay = day + config.rebalPeriod

    const snap = subHistory[day]
    const prevSnap = day >= config.rebalPeriod ? subHistory[day - config.rebalPeriod] : null

    const passed = snap.subs.filter(sub => {
      const prevSub = prevSnap?.subs.find(s => s.gics_code === sub.gics_code)
      return config.subFilters.length === 0 ||
        config.subFilters.every(f => checkFilter(f, sub, prevSub))
    })

    const ranked = [...passed].sort((a, b) => {
      const av = (a[config.rankBy as keyof SubReturn] as number | null) ?? 0
      const bv = (b[config.rankBy as keyof SubReturn] as number | null) ?? 0
      return config.rankDir === 'desc' ? bv - av : av - bv
    })

    ranked.slice(0, config.topN).forEach(s => selected.add(s.gics_code))
  }

  return Array.from(selected)
}
