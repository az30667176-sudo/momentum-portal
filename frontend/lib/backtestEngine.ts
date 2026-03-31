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

  // 3-month windows, all 12 fired in a single Promise.all (no batching).
  // Each window ≈ 10K rows → completes in ~2-3s (safe within Supabase 8s statement timeout).
  // All run simultaneously → total time = slowest window (~3s), not rounds × per-round time.
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

  // Single parallel round: all 3 windows fired simultaneously.
  const allSubRows: Record<string, unknown>[] = []
  const results = await Promise.all(
    windows.map(w =>
      supabase
        .from('daily_sub_returns')
        .select(SELECT_SUB)
        .gte('date', w.from)
        .lt('date', w.to)
        .order('date', { ascending: true })
        .order('gics_code', { ascending: true })
        .range(0, 41999)
    )
  )
  for (const chunk of results) {
    if (chunk.error) throw new Error(`sub range query failed: ${chunk.error.message}`)
    allSubRows.push(...(chunk.data as Record<string, unknown>[]))
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

// Cached sub history — 15-minute cache (sub data updates once a day, long cache reduces
// cold-start frequency and thundering-herd risk on Supabase free tier)
export const fetchSubHistory = unstable_cache(
  _fetchSubHistoryRaw,
  ['sub-history-v8'],
  { revalidate: 900 }
)

// ── SPY daily returns ─────────────────────────────────────────
// Fetch real SPY adjusted-close returns from Yahoo Finance.
// Falls back gracefully to an empty Map (engine uses EW average as fallback).

async function _fetchSpyHistoryRaw(): Promise<Map<string, number>> {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/SPY?interval=1d&range=4y'
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; momentum-portal/1.0)' },
    })
    if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`)
    const json = await res.json() as {
      chart: { result: Array<{
        timestamp: number[]
        indicators: {
          adjclose?: Array<{ adjclose: (number | null)[] }>
          quote?: Array<{ close: (number | null)[] }>
        }
      }> | null }
    }
    const result = json.chart.result?.[0]
    if (!result) throw new Error('no chart result')
    const timestamps = result.timestamp
    const closes: (number | null)[] =
      result.indicators.adjclose?.[0]?.adjclose ??
      result.indicators.quote?.[0]?.close ?? []

    const retMap = new Map<string, number>()
    for (let i = 1; i < timestamps.length; i++) {
      const c0 = closes[i - 1]
      const c1 = closes[i]
      if (c0 == null || c1 == null || c0 === 0) continue
      const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0]
      retMap.set(date, parseFloat(((c1 / c0 - 1) * 100).toFixed(4)))
    }
    return retMap
  } catch (e) {
    console.error('[fetchSpyHistory] failed, falling back to EW average:', e)
    return new Map()
  }
}

export const fetchSpyHistory = unstable_cache(
  _fetchSpyHistoryRaw,
  ['spy-history-v1'],
  { revalidate: 3600 }  // 1-hour cache (SPY data doesn't change intraday for strategy purposes)
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
// Cached stock history keyed by rebalPeriod.
// Rebalancing dates depend only on rebalPeriod (not topN/subFilters/etc.),
// so runs with the same rebalPeriod share the same DB data within 5 minutes.
async function _fetchStockHistoryByRebalPeriodRaw(rebalPeriod: number): Promise<DailyStockSnapshot[]> {
  const subHistory = await fetchSubHistory()  // reuses the 5-min cache
  const rebalDates = collectRebalDates({ rebalPeriod } as BacktestConfig, subHistory)
  return fetchStockHistoryForDates(rebalDates)
}

export const fetchStockHistoryByRebalPeriod = unstable_cache(
  _fetchStockHistoryByRebalPeriodRaw,
  ['stock-history-rp'],
  { revalidate: 300 }
)

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
  if (n < 2) return { annRet: 0, sharpe: 0, sortino: 0, mdd: 0, wr: 0, calmar: 0, profitFactor: 0 }

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

  const calmar = mdd > 0 ? parseFloat((annRet / mdd).toFixed(2)) : 0

  const grossProfit = r.filter(x => x > 0).reduce((a, b) => a + b, 0)
  const grossLoss   = Math.abs(r.filter(x => x < 0).reduce((a, b) => a + b, 0))
  const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : 0

  return {
    annRet: parseFloat(annRet.toFixed(2)),
    sharpe: parseFloat(sharpe.toFixed(2)),
    sortino: parseFloat(sortino.toFixed(2)),
    mdd: parseFloat(mdd.toFixed(2)),
    wr,
    calmar,
    profitFactor,
  }
}

// ── Main engine ───────────────────────────────────────────────

export function runBacktestSync(
  config: BacktestConfig,
  subHistory: DailySubSnapshot[],
  stockHistory: DailyStockSnapshot[],
  spyReturns: Map<string, number> = new Map()
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

  // Track the most recent non-empty stock map so rebal dates without exact
  // stock data can still pick individual stocks instead of falling back to sub-level.
  let lastKnownStockMap = new Map<string, StockReturn>()

  for (let day = 0; day < N; day++) {
    const snap = subHistory[day]
    const date = snap.date
    dates.push(date)
    const prevSnap = day >= config.rebalPeriod ? subHistory[day - config.rebalPeriod] : null
    const prevDaySnap = day > 0 ? subHistory[day - 1] : null
    const isOOS = day >= isSplitDay

    // SPY: use real SPY daily return if available, else fallback to EW sub average
    const allRets = snap.subs.map(s => s.ret_1d ?? 0)
    const ewRet = allRets.length > 0 ? allRets.reduce((a, b) => a + b, 0) / allRets.length : 0
    const spyRet = spyReturns.size > 0 ? (spyReturns.get(date) ?? ewRet) : ewRet
    spyEquity *= (1 + spyRet / 100)
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
      // Fix: use h.weight (assigned at rebalance) instead of always 1/N.
      // After mid-period exits, remaining weights sum < 1 — implicit cash drag, which is realistic.
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
          const prevSubForExit = prevDaySnap?.subs.find(s => s.gics_code === h.gics_code)
          if (config.exitFilters.every(f => checkFilter(f, sub, prevSubForExit))) { shouldExit = true; exitReason = 'signal' }
        }

        // Fix 1+2: always use h.weight (not 1/N) and dailyRet (not cumReturn).
        // Previous code added cumReturn on exit day, double-counting all prior daily returns
        // that were already compounded into equity on previous days.
        portRet += h.weight * dailyRet

        if (shouldExit) {
          exitedToday.push(h.subName)
          totalExitCount++
          stopExitsSinceLastRebal++
          // Fix 3: trading cost proportional to position weight, not cumReturn
          portRet -= h.weight * config.tradingCost / 100
          tradeHistory.push({
            ticker: h.ticker,
            gics_code: h.gics_code,
            subName: h.subName,
            entryDate: h.entryDate,
            exitDate: date,
            holdingDays: day - h.entryDay,
            weight: h.weight,
            pnlPct: parseFloat((h.exitIndex - 100).toFixed(2)),
            exitReason,
            rebalLogIdx: h.rebalLogIdx,
          })
        } else {
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
      // Update last known map whenever we have fresh data
      if (dayStockMap.size > 0) lastKnownStockMap = dayStockMap
      // Use current date's data if available; otherwise fall back to most recent known data.
      // This ensures individual stock trades even when daily_stock_returns is missing for a specific date.
      const effectiveStockMap = dayStockMap.size > 0 ? dayStockMap : lastKnownStockMap
      const hasStockData = effectiveStockMap.size > 0
      const newTickers: { ticker: string; gics_code: string; subName: string }[] = []

      for (const sub of selectedSubs) {
        if (!finalCodes.has(sub.gics_code)) continue
        const subName = sub.gics_universe?.sub_industry ?? sub.gics_code

        if (hasStockData) {
          const subStocks: StockReturn[] = []
          for (const [k, st] of effectiveStockMap) {
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

      // Global regime filter: block new entries when SPY proxy < MA(N)
      const spyInRegime = (() => {
        if (!config.spyMaFilter) return true
        const period = Math.max(2, config.spyMaPeriod ?? 200)
        const window = spyCurve.slice(Math.max(0, spyCurve.length - period))
        if (window.length < Math.min(period, 20)) return true  // insufficient history
        const ma = window.reduce((a, b) => a + b, 0) / window.length
        return spyEquity >= ma
      })()

      if (newTickers.length > 0 && spyInRegime) {
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
