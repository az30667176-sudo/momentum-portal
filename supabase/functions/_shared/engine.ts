/**
 * _shared/engine.ts
 * All types + backtest engine logic, shared by run-backtest and dry-scan Edge Functions.
 */

// ── Types ──────────────────────────────────────────────────────

export interface GicsUniverse {
  gics_code: string
  sector: string
  industry_group: string | null
  industry: string | null
  sub_industry: string
  etf_proxy: string | null
}

export interface SubReturn {
  date: string
  gics_code: string
  ret_1d: number | null
  ret_1w: number | null
  ret_1m: number | null
  ret_3m: number | null
  ret_6m: number | null
  ret_12m: number | null
  mom_6m: number | null
  mom_12m: number | null
  mom_score: number | null
  rank_today: number | null
  rank_prev_week: number | null
  delta_rank: number | null
  breadth_pct: number | null
  volatility_8w: number | null
  rvol: number | null
  obv_trend: number | null
  vol_mom: number | null
  pv_divergence: string | null
  stock_count: number | null
  [key: string]: unknown
  gics_universe?: GicsUniverse
}

export interface StockReturn {
  date: string
  ticker: string
  gics_code: string
  ret_1d: number | null
  ret_1w: number | null
  ret_1m: number | null
  ret_3m: number | null
  mom_score: number | null
  rank_in_sub: number | null
  rvol: number | null
  obv_trend: number | null
}

export interface DailySubSnapshot {
  date: string
  subs: SubReturn[]
}

export interface DailyStockSnapshot {
  date: string
  stocks: StockReturn[]
}

export type FilterType = 'static' | 'crossover' | 'delta' | 'rank_break'
export type FilterOp = '>=' | '<=' | 'between' | 'rise' | 'fall'
export type CrossoverDir = 'neg_to_pos' | 'pos_to_neg'
export type RankMode = 'top_pct' | 'improve'
export type WeightMode = 'equal' | 'momentum' | 'volatility'
export type ExitReason = 'rebal' | 'stop_loss' | 'trailing_stop' | 'take_profit' | 'time_stop' | 'signal'

export interface SubFilter {
  id: string
  type: FilterType
  indicator: string
  op?: FilterOp
  direction?: CrossoverDir
  mode?: RankMode
  value: number
  value2?: number
}

export interface BacktestConfig {
  subFilters: SubFilter[]
  exitFilters: SubFilter[]
  rankBy: string
  rankDir: 'desc' | 'asc'
  topN: number
  stockRankBy: string
  stocksPerSub: number
  rebalPeriod: number
  weightMode: WeightMode
  maxStockWeight: number
  maxSubWeight: number
  bufferRule: number
  stopLoss: number
  trailingStop: number
  takeProfit: number
  timeStop: number
  tradingCost: number
  isSplitPct: number
}

export interface Trade {
  ticker: string
  gics_code: string
  subName: string
  entryDate: string
  exitDate: string
  holdingDays: number
  weight: number
  pnlPct: number
  exitReason: ExitReason
  rebalLogIdx: number
}

export interface Holding {
  ticker: string
  gics_code: string
  subName: string
  entryDay: number
  entryDate: string
  entryEquity: number
  peakCumReturn: number
  cumReturn: number
  exitIndex: number
  weight: number
  rebalLogIdx: number
}

export interface FilterConditionDetail {
  indicator: string
  type: FilterType
  currVal: number | null
  prevVal: number | null
  passed: boolean
}

export interface FilterDetail {
  subName: string
  gics_code: string
  passed: boolean
  conditions: FilterConditionDetail[]
}

export interface RebalLog {
  day: number
  date: string
  isOOS: boolean
  selectedSubs: string[]
  entering: string[]
  exiting: string[]
  holdingCount: number
  exitedToday: string[]
  filterDetails: FilterDetail[]
  stockEntriesCount: number
  stockExitsCount: number
}

export interface PerfMetrics {
  annRet: number
  sharpe: number
  sortino: number
  mdd: number
  wr: number
}

export interface BacktestResult {
  equityCurve: number[]
  drawdownCurve: number[]
  dailyReturns: number[]
  spyCurve: number[]
  ewCurve: number[]
  dates: string[]
  rebalLogs: RebalLog[]
  tradeHistory: Trade[]
  fullPerf: PerfMetrics
  isPerf: PerfMetrics
  oosPerf: PerfMetrics
  totalRebalCount: number
  totalExitCount: number
  stockDataAvailable: boolean
  isSplitDay: number
}

// ── Engine helpers ─────────────────────────────────────────────

export function checkFilter(
  filter: SubFilter,
  curr: SubReturn | undefined,
  prev: SubReturn | undefined
): boolean {
  if (!curr) return false
  const currVal = curr[filter.indicator] as number | null | undefined
  const prevVal = prev ? prev[filter.indicator] as number | null | undefined : undefined
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
  let w = weights.map(v => Math.min(v, maxStock))

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

  const total = w.reduce((a, b) => a + b, 0)
  return total > 0 ? w.map(v => v / total) : w
}

function calcWeights(
  tickers: string[],
  gicsCodes: string[],
  subs: SubReturn[],
  stockMap: Map<string, StockReturn>,
  mode: WeightMode,
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
      return Math.max((sub?.volatility_8w as number | null) ?? 15, 0.001)
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

    const allRets = snap.subs.map(s => s.ret_1d ?? 0)
    const avgRet = allRets.length > 0 ? allRets.reduce((a, b) => a + b, 0) / allRets.length : 0
    spyEquity *= (1 + avgRet / 100)
    spyCurve.push(spyEquity)

    const sorted20 = [...snap.subs].sort((a, b) => (b.mom_score ?? 0) - (a.mom_score ?? 0)).slice(0, 20)
    const ew20Ret = sorted20.length > 0
      ? sorted20.reduce((a, s) => a + (s.ret_1d ?? 0), 0) / sorted20.length
      : 0
    ewEquity *= (1 + ew20Ret / 100)
    ewCurve.push(ewEquity)

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

    if (day >= nextRebalDay) {
      nextRebalDay = day + config.rebalPeriod

      const filterDetails: FilterDetail[] = []
      const passedSubs: SubReturn[] = []

      for (const sub of snap.subs) {
        const prevSub = prevSnap?.subs.find(s => s.gics_code === sub.gics_code)
        const subName = sub.gics_universe?.sub_industry ?? sub.gics_code

        const conditions: FilterConditionDetail[] = config.subFilters.map(f => {
          const currVal = sub[f.indicator] as number | null | undefined
          const prevVal = prevSub ? prevSub[f.indicator] as number | null | undefined : undefined
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
        const av = (a[config.rankBy] as number | null) ?? 0
        const bv = (b[config.rankBy] as number | null) ?? 0
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

// ── Collect rebal dates (fast pass — no full computation) ─────

export function collectRebalDates(
  config: BacktestConfig,
  subHistory: DailySubSnapshot[]
): string[] {
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

// ── Dry scan ──────────────────────────────────────────────────

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
    const prevSnap = day > 0 ? subHistory[day - 1] : null

    const passed = snap.subs.filter(sub => {
      const prevSub = prevSnap?.subs.find(s => s.gics_code === sub.gics_code)
      return config.subFilters.length === 0 ||
        config.subFilters.every(f => checkFilter(f, sub, prevSub))
    })

    passed.forEach(s => selected.add(s.gics_code))
  }

  return [...selected]
}
