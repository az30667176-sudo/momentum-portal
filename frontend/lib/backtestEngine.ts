/**
 * backtestEngine.ts
 * Pure server-side backtest engine + Supabase data fetching.
 * Imported by /api/run-backtest and /api/run-robustness.
 */

import { createClient } from '@supabase/supabase-js'
import {
  SubReturn, StockReturn,
  DailySubSnapshot, DailyStockSnapshot,
  SubFilter, BacktestConfig, Holding,
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

const SUB_SELECT = [
  'date', 'gics_code', 'ret_1d', 'ret_1w', 'ret_1m', 'ret_3m', 'ret_6m', 'ret_12m',
  'mom_score', 'rank_today', 'rank_prev_week', 'delta_rank', 'stock_count',
  'obv_trend', 'rvol', 'vol_mom', 'pv_divergence',
  'sharpe_8w', 'sortino_8w', 'win_rate_8w', 'volatility_8w', 'skewness',
  'information_ratio', 'momentum_decay_rate', 'breadth_adj_mom',
  'downside_capture', 'calmar_ratio', 'rs_trend_slope',
  'leader_lagger_ratio', 'cmf', 'mfi', 'vrsi', 'pvt_slope',
  'vol_surge_score', 'beta', 'momentum_autocorr', 'price_trend_r2', 'ad_slope',
  'breadth_pct',
  'gics_universe(sector,industry_group,industry,sub_industry,etf_proxy)',
].join(',')

export async function fetchBacktestData(): Promise<{
  subHistory: DailySubSnapshot[]
  stockHistory: DailyStockSnapshot[]
}> {
  const supabase = makeClient()

  // Sub history: parallel fetch
  const { count } = await supabase
    .from('daily_sub_returns')
    .select('*', { count: 'exact', head: true })

  const total = count ?? 0
  const pageSize = 1000
  const pageCount = Math.ceil(total / pageSize)

  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      supabase
        .from('daily_sub_returns')
        .select(SUB_SELECT)
        .order('date', { ascending: true })
        .range(i * pageSize, (i + 1) * pageSize - 1)
    )
  )

  const allSubRows = pages.flatMap(p => (p.data ?? []) as SubReturn[])
  const subByDate = new Map<string, SubReturn[]>()
  for (const row of allSubRows) {
    const arr = subByDate.get(row.date) ?? []
    arr.push(row)
    subByDate.set(row.date, arr)
  }
  const subHistory: DailySubSnapshot[] = Array.from(subByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, subs]) => ({ date, subs }))

  // Stock history: single RPC call
  const { data: stockRaw, error: stockErr } = await supabase
    .rpc('get_backtest_stock_history')

  if (stockErr) console.error('RPC error:', stockErr)

  const stockHistory: DailyStockSnapshot[] = Array.isArray(stockRaw)
    ? (stockRaw as DailyStockSnapshot[]).sort((a, b) => a.date.localeCompare(b.date))
    : []

  return { subHistory, stockHistory }
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

function capWeights(weights: number[], maxPct: number): number[] {
  const max = maxPct / 100
  let capped = weights.map(w => Math.min(w, max))
  const total = capped.reduce((a, b) => a + b, 0)
  return total > 0 ? capped.map(w => w / total) : capped
}

function calcWeights(
  tickers: string[],
  subs: SubReturn[],
  stockMap: Map<string, StockReturn>,
  mode: BacktestConfig['weightMode'],
  maxSingleWeight: number
): number[] {
  const n = tickers.length
  if (n === 0) return []

  if (mode === 'equal') return capWeights(Array(n).fill(1 / n), maxSingleWeight)

  if (mode === 'momentum') {
    const scores = tickers.map(t => {
      const st = stockMap.get(t)
      return Math.max(st?.mom_score ?? 50, 0.001)
    })
    const total = scores.reduce((a, b) => a + b, 0)
    return capWeights(scores.map(s => s / total), maxSingleWeight)
  }

  if (mode === 'volatility') {
    const vols = tickers.map(t => {
      const st = stockMap.get(t)
      const sub = subs.find(s => s.gics_code === (st?.gics_code ?? t))
      return Math.max(sub?.volatility_8w ?? 15, 0.001)
    })
    const invVols = vols.map(v => 1 / v)
    const total = invVols.reduce((a, b) => a + b, 0)
    return capWeights(invVols.map(iv => iv / total), maxSingleWeight)
  }

  return Array(n).fill(1 / n)
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
  let pendingOrders: { ticker: string; gics_code: string; subName: string; weight: number }[] = []
  let equity = 1
  let spyEquity = 1
  let ewEquity = 1
  let nextRebalDay = 0
  let peakEquity = 1
  let totalExitCount = 0

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
    const prevSnap = day > 0 ? subHistory[day - 1] : null
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
        entryEquity: equity * o.weight,
        peakCumReturn: 0,
        cumReturn: 0,
      }))
      pendingOrders = []
    }

    // Daily P&L
    let portRet = 0
    const exitedToday: string[] = []

    if (holdings.length > 0) {
      const equalW = 1 / holdings.length
      const updatedHoldings: Holding[] = []

      for (const h of holdings) {
        const sub = snap.subs.find(s => s.gics_code === h.gics_code)
        const dailyRet = (sub?.ret_1d ?? 0) / 100
        h.cumReturn = (1 + h.cumReturn / 100) * (1 + dailyRet) * 100 - 100
        h.peakCumReturn = Math.max(h.peakCumReturn, h.cumReturn)

        let shouldExit = false
        if (config.stopLoss < 0 && h.cumReturn <= config.stopLoss) shouldExit = true
        if (config.trailingStop > 0) {
          if (h.peakCumReturn - h.cumReturn >= config.trailingStop) shouldExit = true
        }
        if (config.takeProfit > 0 && h.cumReturn >= config.takeProfit) shouldExit = true
        if (config.timeStop > 0 && (day - h.entryDay) >= config.timeStop * 5) shouldExit = true
        if (config.exitFilters.length > 0 && sub) {
          const prevSub = prevSnap?.subs.find(s => s.gics_code === h.gics_code)
          if (config.exitFilters.every(f => checkFilter(f, sub, prevSub))) shouldExit = true
        }

        if (shouldExit) {
          exitedToday.push(h.subName)
          totalExitCount++
          portRet += equalW * (h.cumReturn / 100) - Math.abs(h.cumReturn * equalW) * config.tradingCost / 100
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
      nextRebalDay = day + config.rebalPeriod * 5

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
      const newTickers: { ticker: string; gics_code: string; subName: string }[] = []

      for (const sub of selectedSubs) {
        if (!finalCodes.has(sub.gics_code)) continue
        const subName = sub.gics_universe?.sub_industry ?? sub.gics_code

        if (stockDataAvailable) {
          const subStocks: StockReturn[] = []
          for (const [, st] of dayStockMap) {
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

      if (newTickers.length > 0) {
        const tickerIds = newTickers.map(t => t.ticker)
        const weights = calcWeights(tickerIds, snap.subs, dayStockMap, config.weightMode, config.maxSingleWeight)
        pendingOrders = newTickers.map((t, wi) => ({ ...t, weight: weights[wi] ?? 1 / newTickers.length }))
      }
      holdings = []

      rebalLogs.push({
        day, date, isOOS,
        selectedSubs: selectedSubs.map(s => s.gics_universe?.sub_industry ?? s.gics_code),
        entering, exiting,
        holdingCount: newTickers.length,
        exitedToday, filterDetails,
      })
    } else if (exitedToday.length > 0 && rebalLogs.length > 0) {
      rebalLogs[rebalLogs.length - 1].exitedToday.push(...exitedToday)
    }
  }

  return {
    equityCurve, drawdownCurve, dailyReturns, spyCurve, ewCurve, dates,
    rebalLogs,
    fullPerf: calcPerf(dailyReturns, equityCurve, 0, dailyReturns.length),
    isPerf: calcPerf(dailyReturns, equityCurve, 0, isSplitDay),
    oosPerf: calcPerf(dailyReturns, equityCurve, isSplitDay, dailyReturns.length),
    totalRebalCount: rebalLogs.length,
    totalExitCount,
    stockDataAvailable,
    isSplitDay,
  }
}
