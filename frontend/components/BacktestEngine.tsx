'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer
} from 'recharts'
import {
  SubReturn, StockReturn, DailySubSnapshot, DailyStockSnapshot,
  SubFilter, BacktestConfig, Holding,
  FilterDetail, FilterConditionDetail, RebalLog, PerfMetrics, BacktestResult,
  FilterType, WeightMode,
} from '@/lib/types'

// ── Indicator Groups ──────────────────────────────────────────

const INDICATOR_GROUPS = [
  {
    group: '動能品質',
    options: [
      { key: 'mom_score', label: 'Mom Score' },
      { key: 'information_ratio', label: 'Information Ratio' },
      { key: 'momentum_decay_rate', label: 'Momentum Decay Rate' },
      { key: 'breadth_adj_mom', label: 'Breadth-Adj Momentum' },
      { key: 'rs_trend_slope', label: 'RS Trend Slope' },
      { key: 'ret_1d', label: '1D Return' },
      { key: 'ret_1w', label: '1W Return' },
      { key: 'ret_1m', label: '1M Return' },
      { key: 'ret_3m', label: '3M Return' },
      { key: 'ret_6m', label: '6M Return' },
    ]
  },
  {
    group: '風險調整',
    options: [
      { key: 'sortino_8w', label: 'Sortino Ratio' },
      { key: 'calmar_ratio', label: 'Calmar Ratio' },
      { key: 'volatility_8w', label: 'Volatility' },
      { key: 'sharpe_8w', label: 'Sharpe 8W' },
    ]
  },
  {
    group: '板塊結構',
    options: [
      { key: 'leader_lagger_ratio', label: 'Leader/Lagger Ratio' },
      { key: 'downside_capture', label: 'Downside Capture' },
    ]
  },
  {
    group: '資金流動',
    options: [
      { key: 'cmf', label: 'CMF' },
      { key: 'mfi', label: 'MFI' },
      { key: 'pvt_slope', label: 'PVT Slope' },
      { key: 'rvol', label: 'RVol' },
      { key: 'vol_surge_score', label: 'Vol Surge Score' },
    ]
  },
  {
    group: '策略適性',
    options: [
      { key: 'beta', label: 'Beta' },
      { key: 'momentum_autocorr', label: 'Momentum Autocorrelation' },
      { key: 'price_trend_r2', label: 'Price Trend R²' },
    ]
  },
]

const ALL_INDICATORS = INDICATOR_GROUPS.flatMap(g => g.options)

// ── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: BacktestConfig = {
  subFilters: [],
  exitFilters: [],
  rankBy: 'mom_score',
  rankDir: 'desc',
  topN: 10,
  stockRankBy: 'mom_score',
  stocksPerSub: 3,
  rebalPeriod: 4,
  weightMode: 'equal',
  maxSingleWeight: 20,
  bufferRule: 10,
  stopLoss: -15,
  trailingStop: 0,
  takeProfit: 30,
  timeStop: 0,
  tradingCost: 0.1,
  isSplitPct: 70,
}

// ── checkFilter ───────────────────────────────────────────────

function checkFilter(
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

// ── Weight Helpers ────────────────────────────────────────────

function capWeights(weights: number[], maxPct: number): number[] {
  const max = maxPct / 100
  let capped = weights.map(w => Math.min(w, max))
  const totalCapped = capped.reduce((a, b) => a + b, 0)
  if (totalCapped > 0) {
    capped = capped.map(w => w / totalCapped)
  }
  return capped
}

function calcWeights(
  tickers: string[],
  subs: SubReturn[],
  stockHistory: DailyStockSnapshot[],
  dayIdx: number,
  mode: WeightMode,
  maxSingleWeight: number
): number[] {
  const n = tickers.length
  if (n === 0) return []

  if (mode === 'equal') {
    const w = Array(n).fill(1 / n)
    return capWeights(w, maxSingleWeight)
  }

  if (mode === 'momentum') {
    const scores = tickers.map(ticker => {
      const dayStocks = dayIdx < stockHistory.length ? stockHistory[dayIdx].stocks : []
      const st = dayStocks.find(s => s.ticker === ticker)
      const val = st?.mom_score ?? 50
      return Math.max(val, 0.001)
    })
    const total = scores.reduce((a, b) => a + b, 0)
    const w = scores.map(s => s / total)
    return capWeights(w, maxSingleWeight)
  }

  if (mode === 'volatility') {
    // Inverse volatility: use 1/vol for each sub
    const vols = tickers.map(ticker => {
      const dayStocks = dayIdx < stockHistory.length ? stockHistory[dayIdx].stocks : []
      const st = dayStocks.find(s => s.ticker === ticker)
      const subGics = st?.gics_code
      const sub = subs.find(s => s.gics_code === subGics)
      const vol = sub?.volatility_8w ?? 15
      return Math.max(vol, 0.001)
    })
    const invVols = vols.map(v => 1 / v)
    const total = invVols.reduce((a, b) => a + b, 0)
    const w = invVols.map(iv => iv / total)
    return capWeights(w, maxSingleWeight)
  }

  return Array(n).fill(1 / n)
}

// ── calcPerf ─────────────────────────────────────────────────

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

// ── runBacktestSync ───────────────────────────────────────────

function runBacktestSync(
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

  // Equity weights used for equal-weight benchmark
  let holdings: Holding[] = []
  let pendingOrders: { ticker: string; gics_code: string; subName: string; weight: number }[] = []
  let equity = 1
  let spyEquity = 1
  let ewEquity = 1
  let nextRebalDay = 0
  let peakEquity = 1
  let totalExitCount = 0

  // Build a map from (dayIdx, gics_code) -> SubReturn for fast lookup
  const subMap: Map<string, SubReturn> = new Map()

  // Build stock map
  const stockByDate: Map<string, Map<string, StockReturn>> = new Map()
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

    // Update subMap for this day
    for (const s of snap.subs) {
      subMap.set(s.gics_code, s)
    }

    // Compute SPY proxy: average of all sub ret_1d
    const allRets = snap.subs.map(s => s.ret_1d ?? 0)
    const avgRet = allRets.length > 0 ? allRets.reduce((a, b) => a + b, 0) / allRets.length : 0
    spyEquity *= (1 + avgRet / 100)
    spyCurve.push(spyEquity)

    // Equal-weight: top 20 by mom_score
    const sorted20 = [...snap.subs].sort((a, b) => (b.mom_score ?? 0) - (a.mom_score ?? 0)).slice(0, 20)
    const ew20Ret = sorted20.length > 0
      ? sorted20.reduce((a, s) => a + (s.ret_1d ?? 0), 0) / sorted20.length
      : 0
    ewEquity *= (1 + ew20Ret / 100)
    ewCurve.push(ewEquity)

    // Execute pending orders (buy-in at today's open → approximate: use today's ret_1d)
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

    // Daily P&L: update holdings
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

        // Check exit conditions
        let shouldExit = false

        // Stop loss
        if (config.stopLoss < 0 && h.cumReturn <= config.stopLoss) {
          shouldExit = true
        }
        // Trailing stop
        if (config.trailingStop > 0) {
          const drawdown = h.peakCumReturn - h.cumReturn
          if (drawdown >= config.trailingStop) shouldExit = true
        }
        // Take profit
        if (config.takeProfit > 0 && h.cumReturn >= config.takeProfit) {
          shouldExit = true
        }
        // Time stop
        if (config.timeStop > 0 && (day - h.entryDay) >= config.timeStop * 5) {
          shouldExit = true
        }
        // Exit filters
        if (config.exitFilters.length > 0 && sub) {
          const prevSub = prevSnap?.subs.find(s => s.gics_code === h.gics_code)
          const allPassed = config.exitFilters.every(f => checkFilter(f, sub, prevSub))
          if (allPassed) shouldExit = true
        }

        if (shouldExit) {
          exitedToday.push(h.subName)
          totalExitCount++
          const cost = Math.abs(h.cumReturn * equalW) * config.tradingCost / 100
          portRet += equalW * (h.cumReturn / 100) - cost
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

    // Rebalance check
    if (day >= nextRebalDay) {
      nextRebalDay = day + config.rebalPeriod * 5

      // Get candidate subs by applying filters
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

      // Rank and select top N
      const ranked = [...passedSubs].sort((a, b) => {
        const av = a[config.rankBy as keyof SubReturn] as number | null ?? 0
        const bv = b[config.rankBy as keyof SubReturn] as number | null ?? 0
        return config.rankDir === 'desc' ? bv - av : av - bv
      })

      const selectedSubs = ranked.slice(0, config.topN)
      const selectedCodes = new Set(selectedSubs.map(s => s.gics_code))

      // Buffer rule: keep current holdings if they're still within bufferRule positions
      const currentHoldingCodes = new Set(holdings.map(h => h.gics_code))
      const finalCodes = new Set<string>(selectedCodes)

      // Apply buffer: don't exit holdings unless they drop more than bufferRule positions
      for (const holdCode of currentHoldingCodes) {
        const rankIdx = ranked.findIndex(s => s.gics_code === holdCode)
        if (rankIdx >= 0 && rankIdx < config.topN + config.bufferRule) {
          finalCodes.add(holdCode)
        }
      }

      // Determine entering and exiting
      const entering = selectedSubs
        .filter(s => !currentHoldingCodes.has(s.gics_code))
        .map(s => s.gics_universe?.sub_industry ?? s.gics_code)
      const exiting = [...currentHoldingCodes]
        .filter(code => !finalCodes.has(code))
        .map(code => {
          const s = snap.subs.find(s => s.gics_code === code)
          return s?.gics_universe?.sub_industry ?? code
        })

      // Build new holding list (use stock-level if available)
      const newTickers: { ticker: string; gics_code: string; subName: string }[] = []

      for (const sub of selectedSubs) {
        if (!finalCodes.has(sub.gics_code)) continue
        const subName = sub.gics_universe?.sub_industry ?? sub.gics_code

        if (stockDataAvailable) {
          const stockSnap = stockHistory.find(s => s.date === date)
          if (stockSnap) {
            const subStocks = stockSnap.stocks
              .filter(s => s.gics_code === sub.gics_code)
              .sort((a, b) => {
                const av = a[config.stockRankBy as keyof StockReturn] as number | null ?? 0
                const bv = b[config.stockRankBy as keyof StockReturn] as number | null ?? 0
                return bv - av
              })
              .slice(0, config.stocksPerSub)
            for (const st of subStocks) {
              newTickers.push({ ticker: st.ticker, gics_code: sub.gics_code, subName })
            }
          } else {
            newTickers.push({ ticker: sub.gics_code, gics_code: sub.gics_code, subName })
          }
        } else {
          newTickers.push({ ticker: sub.gics_code, gics_code: sub.gics_code, subName })
        }
      }

      // Apply trading cost on turnover
      const newCodes = new Set(newTickers.map(t => t.ticker))
      const oldCodes = new Set(holdings.map(h => h.ticker))
      const turnovers = [...newCodes].filter(c => !oldCodes.has(c)).length
        + [...oldCodes].filter(c => !newCodes.has(c)).length
      const costDrag = (turnovers / Math.max(newTickers.length + holdings.length, 1)) * config.tradingCost / 100
      equity *= (1 - costDrag)

      // Set pending orders with weight mode applied
      if (newTickers.length > 0) {
        const tickerIds = newTickers.map(t => t.ticker)
        const weights = calcWeights(tickerIds, snap.subs, stockHistory, day, config.weightMode, config.maxSingleWeight)
        pendingOrders = newTickers.map((t, wi) => ({ ...t, weight: weights[wi] ?? (1 / newTickers.length) }))
      }
      holdings = [] // will be replaced on next day

      const log: RebalLog = {
        day,
        date,
        isOOS,
        selectedSubs: selectedSubs.map(s => s.gics_universe?.sub_industry ?? s.gics_code),
        entering,
        exiting,
        holdingCount: newTickers.length,
        exitedToday,
        filterDetails,
      }
      rebalLogs.push(log)
    } else if (exitedToday.length > 0) {
      // Record exits in last rebalLog
      if (rebalLogs.length > 0) {
        rebalLogs[rebalLogs.length - 1].exitedToday.push(...exitedToday)
      }
    }
  }

  const fullPerf = calcPerf(dailyReturns, equityCurve, 0, dailyReturns.length)
  const isPerf = calcPerf(dailyReturns, equityCurve, 0, isSplitDay)
  const oosPerf = calcPerf(dailyReturns, equityCurve, isSplitDay, dailyReturns.length)

  return {
    equityCurve,
    drawdownCurve,
    dailyReturns,
    spyCurve,
    ewCurve,
    dates,
    rebalLogs,
    fullPerf,
    isPerf,
    oosPerf,
    totalRebalCount: rebalLogs.length,
    totalExitCount,
    stockDataAvailable,
    isSplitDay,
  }
}

// ── FilterBlock Component ─────────────────────────────────────

interface FilterBlockProps {
  filter: SubFilter
  onChange: (updated: SubFilter) => void
  onDelete: () => void
}

function FilterBlock({ filter, onChange, onDelete }: FilterBlockProps) {
  const types: FilterType[] = ['static', 'crossover', 'delta', 'rank_break']
  const typeLabels: Record<FilterType, string> = {
    static: '數值篩選',
    crossover: '零軸交叉',
    delta: '變化量',
    rank_break: '排名突破',
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800 mb-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-1">
          {types.map(t => (
            <button
              key={t}
              onClick={() => onChange({ ...filter, type: t })}
              className={`px-2 py-0.5 text-xs rounded ${
                filter.type === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {typeLabels[t]}
            </button>
          ))}
        </div>
        <button
          onClick={onDelete}
          className="text-red-500 hover:text-red-700 text-xs px-2"
        >
          ✕ 刪除
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {/* Indicator selector */}
        {filter.type !== 'rank_break' && (
          <select
            value={filter.indicator}
            onChange={e => onChange({ ...filter, indicator: e.target.value })}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
          >
            {INDICATOR_GROUPS.map(g => (
              <optgroup key={g.group} label={g.group}>
                {g.options.map(o => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        {filter.type === 'static' && (
          <>
            <select
              value={filter.op ?? '>='}
              onChange={e => onChange({ ...filter, op: e.target.value as '>='})}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
            >
              <option value=">=">&ge;</option>
              <option value="<=">&le;</option>
              <option value="between">介於</option>
            </select>
            <input
              type="number"
              value={filter.value}
              onChange={e => onChange({ ...filter, value: parseFloat(e.target.value) || 0 })}
              className="w-20 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
            />
            {filter.op === 'between' && (
              <>
                <span className="text-gray-500 text-sm">~</span>
                <input
                  type="number"
                  value={filter.value2 ?? 0}
                  onChange={e => onChange({ ...filter, value2: parseFloat(e.target.value) || 0 })}
                  className="w-20 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
                />
              </>
            )}
            <p className="w-full text-xs text-gray-400 mt-1">每個換倉點，當期值符合條件時納入</p>
          </>
        )}

        {filter.type === 'crossover' && (
          <>
            <select
              value={filter.direction ?? 'neg_to_pos'}
              onChange={e => onChange({ ...filter, direction: e.target.value as 'neg_to_pos' })}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
            >
              <option value="neg_to_pos">由負轉正</option>
              <option value="pos_to_neg">由正轉負</option>
            </select>
            <p className="w-full text-xs text-gray-400 mt-1">上一個換倉點的值 &lt; 0，當前換倉點的值 &gt; 0 時觸發</p>
          </>
        )}

        {filter.type === 'delta' && (
          <>
            <select
              value={filter.op ?? 'rise'}
              onChange={e => onChange({ ...filter, op: e.target.value as 'rise' })}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
            >
              <option value="rise">上升 &ge;</option>
              <option value="fall">下降 &ge;</option>
            </select>
            <input
              type="number"
              value={filter.value}
              onChange={e => onChange({ ...filter, value: parseFloat(e.target.value) || 0 })}
              className="w-20 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
            />
            <p className="w-full text-xs text-gray-400 mt-1">當期值 - 上期值的變化量符合條件時納入</p>
          </>
        )}

        {filter.type === 'rank_break' && (
          <>
            <select
              value={filter.mode ?? 'top_pct'}
              onChange={e => onChange({ ...filter, mode: e.target.value as 'top_pct' })}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
            >
              <option value="top_pct">進入前</option>
              <option value="improve">排名改善 &ge;</option>
            </select>
            <input
              type="number"
              value={filter.value}
              onChange={e => onChange({ ...filter, value: parseFloat(e.target.value) || 0 })}
              className="w-20 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
            />
            {filter.mode === 'top_pct' && (
              <span className="text-sm text-gray-500">%</span>
            )}
            {filter.mode === 'improve' && (
              <span className="text-sm text-gray-500">位</span>
            )}
            <p className="w-full text-xs text-gray-400 mt-1">
              {filter.mode === 'top_pct'
                ? `排名進入前 ${filter.value}%（約前 ${Math.round(145 * filter.value / 100)} 名）時納入`
                : `排名較上期改善 ${filter.value} 位以上時納入`}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────

interface Props {
  latestData: SubReturn[]
}

// ── Main Component ────────────────────────────────────────────

export function BacktestEngine({ latestData }: Props) {
  const [activeTab, setActiveTab] = useState<'config' | 'results' | 'robustness'>('config')
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG)
  const [subHistory, setSubHistory] = useState<DailySubSnapshot[]>([])
  const [stockHistory, setStockHistory] = useState<DailyStockSnapshot[]>([])
  const [stockDataAvailable, setStockDataAvailable] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [runProgress, setRunProgress] = useState(0)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [robustParam, setRobustParam] = useState('rebalPeriod')
  const [robustFrom, setRobustFrom] = useState(1)
  const [robustTo, setRobustTo] = useState(8)
  const [robustStep, setRobustStep] = useState(1)
  const [robustResults, setRobustResults] = useState<{ param: number; oosS: number; perf: PerfMetrics }[]>([])
  const [isRobustRunning, setIsRobustRunning] = useState(false)
  const [expandedRebalIdx, setExpandedRebalIdx] = useState<number | null>(null)
  const [chartRange, setChartRange] = useState<'all' | 'is' | 'oos'>('all')
  const [selectedRobustPoint, setSelectedRobustPoint] = useState<{ param: number; perf: PerfMetrics } | null>(null)

  useEffect(() => {
    setIsLoadingData(true)
    fetch('/api/backtest-data')
      .then(r => r.json())
      .then(({ subHistory, stockHistory }: { subHistory: DailySubSnapshot[]; stockHistory: DailyStockSnapshot[] }) => {
        setSubHistory(subHistory)
        setStockHistory(stockHistory)
        setStockDataAvailable(stockHistory.length > 0 && stockHistory[0].stocks.length > 0)
      })
      .catch(err => console.error('Failed to load backtest data:', err))
      .finally(() => setIsLoadingData(false))
  }, [])

  // Live preview
  const livePreview = useMemo(() => {
    if (!latestData || latestData.length === 0) return []
    const prevSubs = subHistory.length >= 2
      ? subHistory[subHistory.length - 2].subs
      : latestData

    return latestData.map(sub => {
      const prevSub = prevSubs.find(s => s.gics_code === sub.gics_code)
      const conditions = config.subFilters.map(f => {
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
      return {
        subName: sub.gics_universe?.sub_industry ?? sub.gics_code,
        gics_code: sub.gics_code,
        passed,
        conditions,
      }
    }).sort((a, b) => (b.passed ? 1 : 0) - (a.passed ? 1 : 0))
  }, [latestData, config.subFilters, subHistory])

  const runBacktest = useCallback(async () => {
    if (subHistory.length < 20) {
      alert('歷史資料不足 20 天，無法執行回測')
      return
    }
    setIsRunning(true)
    setRunProgress(0)
    setActiveTab('results')

    await new Promise(resolve => setTimeout(resolve, 50))

    try {
      const res = runBacktestSync(config, subHistory, stockHistory)
      setResult(res)
    } finally {
      setIsRunning(false)
      setRunProgress(subHistory.length)
    }
  }, [config, subHistory, stockHistory])

  const runRobustness = useCallback(async () => {
    if (subHistory.length < 20) {
      alert('歷史資料不足')
      return
    }
    setIsRobustRunning(true)
    setRobustResults([])

    const results: { param: number; oosS: number; perf: PerfMetrics }[] = []
    const steps = Math.ceil((robustTo - robustFrom) / robustStep) + 1

    for (let i = 0; i < steps; i++) {
      const paramVal = robustFrom + i * robustStep
      const testConfig = { ...config } as BacktestConfig & Record<string, number>
      testConfig[robustParam] = paramVal

      await new Promise(resolve => setTimeout(resolve, 10))
      const res = runBacktestSync(testConfig as unknown as BacktestConfig, subHistory, stockHistory)
      results.push({ param: paramVal, oosS: res.oosPerf.sharpe, perf: res.oosPerf })
    }

    setRobustResults(results)
    setIsRobustRunning(false)
  }, [config, subHistory, stockHistory, robustParam, robustFrom, robustTo, robustStep])

  // Helpers for filter management
  const addSubFilter = () => {
    const newFilter: SubFilter = {
      id: Math.random().toString(36).slice(2),
      type: 'static',
      indicator: 'mom_score',
      op: '>=',
      value: 50,
    }
    setConfig(c => ({ ...c, subFilters: [...c.subFilters, newFilter] }))
  }

  const updateSubFilter = (idx: number, updated: SubFilter) => {
    setConfig(c => {
      const filters = [...c.subFilters]
      filters[idx] = updated
      return { ...c, subFilters: filters }
    })
  }

  const deleteSubFilter = (idx: number) => {
    setConfig(c => ({ ...c, subFilters: c.subFilters.filter((_, i) => i !== idx) }))
  }

  const addExitFilter = () => {
    const newFilter: SubFilter = {
      id: Math.random().toString(36).slice(2),
      type: 'crossover',
      indicator: 'cmf',
      direction: 'pos_to_neg',
      value: 0,
    }
    setConfig(c => ({ ...c, exitFilters: [...c.exitFilters, newFilter] }))
  }

  const updateExitFilter = (idx: number, updated: SubFilter) => {
    setConfig(c => {
      const filters = [...c.exitFilters]
      filters[idx] = updated
      return { ...c, exitFilters: filters }
    })
  }

  const deleteExitFilter = (idx: number) => {
    setConfig(c => ({ ...c, exitFilters: c.exitFilters.filter((_, i) => i !== idx) }))
  }

  // Chart data preparation
  const chartData = useMemo(() => {
    if (!result) return []
    const { equityCurve, spyCurve, ewCurve, dates, isSplitDay } = result
    let startIdx = 0
    let endIdx = dates.length

    if (chartRange === 'is') {
      endIdx = isSplitDay
    } else if (chartRange === 'oos') {
      startIdx = isSplitDay
    }

    return dates.slice(startIdx, endIdx).map((date, i) => ({
      date,
      strategy: parseFloat(((equityCurve[startIdx + i + 1] ?? 1) * 100 - 100).toFixed(2)),
      spy: parseFloat(((spyCurve[startIdx + i + 1] ?? 1) * 100 - 100).toFixed(2)),
      ew: parseFloat(((ewCurve[startIdx + i + 1] ?? 1) * 100 - 100).toFixed(2)),
      isOOS: (startIdx + i) >= isSplitDay,
    }))
  }, [result, chartRange])

  const drawdownData = useMemo(() => {
    if (!result) return []
    return result.dates.map((date, i) => ({
      date,
      drawdown: -result.drawdownCurve[i + 1] ?? 0,
    }))
  }, [result])

  const monthlyData = useMemo(() => {
    if (!result) return []
    const monthly: Record<string, { ret: number; isOOS: boolean }> = {}
    result.dailyReturns.forEach((r, i) => {
      const date = result.dates[i]
      if (!date) return
      const ym = date.slice(0, 7)
      if (!monthly[ym]) monthly[ym] = { ret: 0, isOOS: i >= result.isSplitDay }
      monthly[ym].ret += r
    })
    return Object.entries(monthly).map(([ym, v]) => ({
      ym,
      ret: parseFloat(v.ret.toFixed(2)),
      isOOS: v.isOOS,
    }))
  }, [result])

  const histogramData = useMemo(() => {
    if (!result) return []
    const bins: Record<string, number> = {}
    const min = -3, max = 3, step = 0.25
    for (let b = min; b < max; b += step) {
      bins[b.toFixed(2)] = 0
    }
    result.dailyReturns.forEach(r => {
      const binKey = (Math.floor(r / step) * step).toFixed(2)
      if (bins[binKey] !== undefined) bins[binKey]++
    })
    return Object.entries(bins).map(([bin, count]) => ({ bin: parseFloat(bin), count }))
  }, [result])

  // OOS vs IS stability badge
  const stabilityBadge = useMemo(() => {
    if (!result) return null
    const ratio = result.isPerf.sharpe !== 0 ? result.oosPerf.sharpe / result.isPerf.sharpe : 0
    if (ratio >= 0.8) {
      return { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', text: 'OOS 表現接近 IS，策略穩健性佳' }
    } else if (ratio >= 0.5) {
      return { color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300', text: 'OOS 略弱於 IS，建議觀察更長時間' }
    } else {
      return { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', text: 'OOS 明顯弱於 IS，可能存在過度擬合' }
    }
  }, [result])

  // Robustness stability
  const robustStability = useMemo(() => {
    if (robustResults.length < 2) return null
    const vals = robustResults.map(r => r.oosS)
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
    if (std < 0.3) return { color: 'text-green-600', text: '穩健' }
    if (vals.some(v => v > mean * 1.5)) return { color: 'text-red-600', text: '可能過擬合' }
    return { color: 'text-orange-600', text: '有一定敏感性' }
  }, [robustResults])

  const inputCls = "text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 dark:text-white"
  const sectionCls = "bg-white dark:bg-gray-800 rounded-xl p-5 mb-4 shadow-sm"
  const labelCls = "text-sm font-medium text-gray-700 dark:text-gray-300"
  const cardCls = "bg-gray-50 dark:bg-gray-700 rounded-lg p-4 text-center"

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">回測專區</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sub-industry 動能策略回測引擎
            {isLoadingData && <span className="ml-2 text-blue-500">載入資料中...</span>}
            {!isLoadingData && subHistory.length > 0 && (
              <span className="ml-2 text-green-600">{subHistory.length} 個交易日已載入</span>
            )}
          </p>
        </div>
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          ← 返回 Heatmap
        </Link>
      </div>

      {/* Tab Bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        {(['config', 'results', 'robustness'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            {tab === 'config' ? '策略設定' : tab === 'results' ? '回測結果' : '參數穩健性'}
          </button>
        ))}
      </div>

      {/* ── Tab 1: Config ── */}
      {activeTab === 'config' && (
        <div>
          {/* Section A: Sub Filters */}
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              A. 產業篩選條件
            </h2>
            {config.subFilters.map((f, idx) => (
              <FilterBlock
                key={f.id}
                filter={f}
                onChange={updated => updateSubFilter(idx, updated)}
                onDelete={() => deleteSubFilter(idx)}
              />
            ))}
            <button
              onClick={addSubFilter}
              className="mt-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              + 新增篩選條件
            </button>

            {/* Ranking */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
              <span className={labelCls}>依</span>
              <select
                value={config.rankBy}
                onChange={e => setConfig(c => ({ ...c, rankBy: e.target.value }))}
                className={inputCls}
              >
                {INDICATOR_GROUPS.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map(o => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select
                value={config.rankDir}
                onChange={e => setConfig(c => ({ ...c, rankDir: e.target.value as 'desc' | 'asc' }))}
                className={inputCls}
              >
                <option value="desc">最高→低</option>
                <option value="asc">最低→高</option>
              </select>
              <span className={labelCls}>排名，選前</span>
              <input
                type="number"
                value={config.topN}
                min={1}
                max={50}
                onChange={e => setConfig(c => ({ ...c, topN: parseInt(e.target.value) || 10 }))}
                className={`${inputCls} w-16`}
              />
              <span className={labelCls}>個產業</span>
            </div>

            {/* Live Preview */}
            {config.subFilters.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  即時預覽（最新日期，共 {livePreview.filter(r => r.passed).length} / {livePreview.length} 符合）
                </h3>
                <div className="overflow-auto max-h-64 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">符合</th>
                        <th className="px-2 py-1 text-left">Sub-industry</th>
                        {config.subFilters.map((f, i) => (
                          <th key={i} className="px-2 py-1 text-left">
                            {ALL_INDICATORS.find(ind => ind.key === f.indicator)?.label ?? f.indicator}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {livePreview.map((row, i) => (
                        <tr key={i} className={`border-t border-gray-100 dark:border-gray-700 ${row.passed ? 'bg-green-50 dark:bg-green-900/10' : ''}`}>
                          <td className="px-2 py-1">
                            {row.passed
                              ? <span className="text-green-600">✓</span>
                              : <span className="text-red-500">✗</span>}
                          </td>
                          <td className="px-2 py-1 font-medium text-gray-700 dark:text-gray-300">{row.subName}</td>
                          {row.conditions.map((cond, ci) => (
                            <td key={ci} className="px-2 py-1">
                              {cond.currVal === null ? (
                                <span className="text-gray-400">—</span>
                              ) : (
                                <span className={cond.passed ? 'text-green-600' : 'text-red-500'}>
                                  {cond.type === 'crossover' || cond.type === 'delta'
                                    ? `${cond.prevVal?.toFixed(2) ?? '?'} → ${cond.currVal?.toFixed(2)}`
                                    : cond.currVal?.toFixed(2)}
                                  {cond.type === 'delta' && cond.prevVal !== null && cond.currVal !== null
                                    ? ` (Δ${(cond.currVal - cond.prevVal) >= 0 ? '+' : ''}${(cond.currVal - cond.prevVal).toFixed(2)})`
                                    : ''}
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Section B: Stock Selection */}
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              B. 個股選取規則
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={labelCls}>依</span>
              <select
                value={config.stockRankBy}
                onChange={e => setConfig(c => ({ ...c, stockRankBy: e.target.value }))}
                className={inputCls}
              >
                <option value="mom_score">Mom Score</option>
                <option value="ret_1d">1D Return</option>
                <option value="ret_1w">1W Return</option>
                <option value="ret_1m">1M Return</option>
                <option value="rvol">RVol</option>
                <option value="obv_trend">OBV Trend</option>
              </select>
              <span className={labelCls}>每個產業選前</span>
              <input
                type="number"
                value={config.stocksPerSub}
                min={1}
                max={10}
                onChange={e => setConfig(c => ({ ...c, stocksPerSub: parseInt(e.target.value) || 3 }))}
                className={`${inputCls} w-16`}
              />
              <span className={labelCls}>檔</span>
            </div>
            {!stockDataAvailable && !isLoadingData && (
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 rounded-lg p-4 text-orange-700 dark:text-orange-300 text-sm mt-3">
                個股資料尚未完整，回測將以 sub-industry 等權替代個股，換倉仍依產業篩選條件執行
              </div>
            )}
          </div>

          {/* Section C: Rebal & Position */}
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              C. 換倉 &amp; 部位設定
            </h2>

            <div className="mb-4">
              <p className={`${labelCls} mb-2`}>換倉週期</p>
              <div className="flex gap-2">
                {([1, 2, 4, 8] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setConfig(c => ({ ...c, rebalPeriod: p }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      config.rebalPeriod === p
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {p === 1 ? '1W' : p === 2 ? '2W' : p === 4 ? '4W' : '8W'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className={`${labelCls} mb-2`}>權重模式</p>
              <div className="flex gap-4">
                {(['equal', 'momentum', 'volatility'] as WeightMode[]).map(mode => (
                  <label key={mode} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      checked={config.weightMode === mode}
                      onChange={() => setConfig(c => ({ ...c, weightMode: mode }))}
                      className="accent-blue-600"
                    />
                    <span className="text-gray-700 dark:text-gray-300">
                      {mode === 'equal' ? '等權重' : mode === 'momentum' ? '動能分數加權' : '波動率反向加權'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <p className={`${labelCls} mb-1`}>單一部位上限：{config.maxSingleWeight}%</p>
              <input
                type="range"
                min={5}
                max={33}
                value={config.maxSingleWeight}
                onChange={e => setConfig(c => ({ ...c, maxSingleWeight: parseInt(e.target.value) }))}
                className="w-full accent-blue-600"
              />
            </div>

            <div className="mb-2">
              <p className={`${labelCls} mb-1`}>Buffer Rule：{config.bufferRule} 位</p>
              <input
                type="range"
                min={0}
                max={25}
                value={config.bufferRule}
                onChange={e => setConfig(c => ({ ...c, bufferRule: parseInt(e.target.value) }))}
                className="w-full accent-blue-600"
              />
              <p className="text-xs text-gray-400 mt-1">新候選排名需領先現持倉 {config.bufferRule} 位才換入</p>
            </div>
          </div>

          {/* Section D: Risk Control */}
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              D. 風險控制
            </h2>

            <div className="mb-5">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">持倉停損停利</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className={`${labelCls} mb-1`}>固定停損：{config.stopLoss}%</p>
                  <input
                    type="range"
                    min={-30}
                    max={-5}
                    value={config.stopLoss}
                    onChange={e => setConfig(c => ({ ...c, stopLoss: parseInt(e.target.value) }))}
                    className="w-full accent-red-500"
                  />
                </div>
                <div>
                  <p className={`${labelCls} mb-1`}>Trailing Stop：{config.trailingStop === 0 ? '關閉' : `${config.trailingStop}%`}</p>
                  <input
                    type="range"
                    min={0}
                    max={30}
                    value={config.trailingStop}
                    onChange={e => setConfig(c => ({ ...c, trailingStop: parseInt(e.target.value) }))}
                    className="w-full accent-orange-500"
                  />
                </div>
                <div>
                  <p className={`${labelCls} mb-1`}>固定停利：{config.takeProfit}%</p>
                  <input
                    type="range"
                    min={10}
                    max={80}
                    value={config.takeProfit}
                    onChange={e => setConfig(c => ({ ...c, takeProfit: parseInt(e.target.value) }))}
                    className="w-full accent-green-500"
                  />
                </div>
                <div>
                  <p className={`${labelCls} mb-1`}>時間停損：{config.timeStop === 0 ? '關閉' : `${config.timeStop} 週`}</p>
                  <input
                    type="range"
                    min={0}
                    max={52}
                    value={config.timeStop}
                    onChange={e => setConfig(c => ({ ...c, timeStop: parseInt(e.target.value) }))}
                    className="w-full accent-purple-500"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                ※ 停損停利每日收盤後計算，觸發時以當日收盤出場。停損若設定後仍需搭配 Buffer Rule 避免頻繁進出。
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">訊號驅動出場</h3>
              <p className="text-xs text-gray-400 mb-2">例：CMF 由正轉負 → 強制出場</p>
              {config.exitFilters.map((f, idx) => (
                <FilterBlock
                  key={f.id}
                  filter={f}
                  onChange={updated => updateExitFilter(idx, updated)}
                  onDelete={() => deleteExitFilter(idx)}
                />
              ))}
              <button
                onClick={addExitFilter}
                className="mt-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                + 新增出場條件
              </button>
            </div>
          </div>

          {/* Section E: Backtest Settings */}
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              E. 回測設定
            </h2>

            <div className="mb-4">
              <p className={`${labelCls} mb-1`}>
                IS / OOS 切割：前 {config.isSplitPct}% 為 IS，後 {100 - config.isSplitPct}% 為 OOS
              </p>
              <input
                type="range"
                min={0}
                max={100}
                value={config.isSplitPct}
                onChange={e => setConfig(c => ({ ...c, isSplitPct: parseInt(e.target.value) }))}
                className="w-full accent-blue-600"
              />
            </div>

            <div className="mb-6">
              <p className={`${labelCls} mb-1`}>交易成本（單邊）：{config.tradingCost.toFixed(2)}%</p>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={Math.round(config.tradingCost * 100)}
                onChange={e => setConfig(c => ({ ...c, tradingCost: parseInt(e.target.value) / 100 }))}
                className="w-full accent-blue-600"
              />
            </div>

            <button
              onClick={runBacktest}
              disabled={isRunning || isLoadingData}
              className={`w-full py-3 rounded-xl text-white font-semibold text-base transition-colors ${
                isRunning || isLoadingData
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isRunning
                ? `計算中... Day ${runProgress} / ${subHistory.length}`
                : isLoadingData
                ? '載入資料中...'
                : '▶ 執行回測'}
            </button>
          </div>
        </div>
      )}

      {/* ── Tab 2: Results ── */}
      {activeTab === 'results' && (
        <div>
          {isRunning && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400">
                  計算中... Day {runProgress} / {subHistory.length}
                </p>
              </div>
            </div>
          )}

          {!isRunning && !result && (
            <div className="text-center py-20 text-gray-500 dark:text-gray-400">
              請先在策略設定 Tab 執行回測
            </div>
          )}

          {!isRunning && result && (
            <>
              {/* Disclaimer */}
              <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-300 rounded-lg p-4 mb-4 text-sm text-orange-700 dark:text-orange-300">
                <p className="font-semibold mb-1">回測說明：</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>使用日頻收盤報酬（ret_1d）模擬持倉損益</li>
                  <li>停損停利：每日收盤後計算累積報酬，觸發時以當日收盤價出場</li>
                  <li>換倉執行：換倉點當日收盤決定名單，下一個交易日以收盤價執行買賣</li>
                  <li>使用當前 SP1500 成分股，存在存活者偏差</li>
                  <li>OOS 結果才具參考價值</li>
                </ul>
              </div>

              {/* Stability Badge */}
              {stabilityBadge && (
                <div className={`inline-block px-4 py-2 rounded-full text-sm font-medium mb-4 ${stabilityBadge.color}`}>
                  {stabilityBadge.text}
                </div>
              )}

              {/* Performance Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                  { label: '年化報酬', val: `${result.fullPerf.annRet}%`, sub: '全期' },
                  { label: 'Sharpe Ratio', val: result.fullPerf.sharpe.toFixed(2), sub: '全期' },
                  { label: 'Sortino Ratio', val: result.fullPerf.sortino.toFixed(2), sub: '全期' },
                  { label: 'Max Drawdown', val: `${result.fullPerf.mdd.toFixed(1)}%`, sub: '全期' },
                  { label: '日勝率', val: `${result.fullPerf.wr}%`, sub: '全期' },
                  { label: 'IS 年化報酬', val: `${result.isPerf.annRet}%`, sub: `前 ${config.isSplitPct}%` },
                  { label: 'OOS 年化報酬', val: `${result.oosPerf.annRet}%`, sub: `後 ${100 - config.isSplitPct}%` },
                  { label: '換倉次數', val: `${result.totalRebalCount}`, sub: `出場 ${result.totalExitCount} 次` },
                ].map(card => (
                  <div key={card.label} className={cardCls}>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{card.val}</p>
                    <p className="text-xs text-gray-400">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Equity Curve */}
              <div className={sectionCls}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white">累積報酬曲線</h3>
                  <div className="flex gap-1">
                    {(['all', 'is', 'oos'] as const).map(r => (
                      <button
                        key={r}
                        onClick={() => setChartRange(r)}
                        className={`px-3 py-1 text-xs rounded ${chartRange === r ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                      >
                        {r.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.floor(chartData.length / 6)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                    <Legend />
                    {chartRange === 'all' && result && (
                      <ReferenceLine
                        x={result.dates[result.isSplitDay]}
                        stroke="#f97316"
                        strokeDasharray="4 2"
                        label={{ value: 'IS|OOS', fontSize: 10, fill: '#f97316' }}
                      />
                    )}
                    <Line type="monotone" dataKey="strategy" name="策略" stroke="#3b82f6" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="spy" name="SPY(等權)" stroke="#9ca3af" dot={false} strokeWidth={1} />
                    <Line type="monotone" dataKey="ew" name="等權Top20" stroke="#10b981" dot={false} strokeWidth={1} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Drawdown */}
              <div className={sectionCls}>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">回撤深度圖</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={drawdownData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.floor(drawdownData.length / 6)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v.toFixed(1)}%`} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                    <Area type="monotone" dataKey="drawdown" name="回撤" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly Heatmap */}
              <div className={sectionCls}>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">月度報酬熱圖</h3>
                <div className="flex flex-wrap gap-1.5">
                  {monthlyData.map(m => {
                    const intensity = Math.min(Math.abs(m.ret) / 5, 1)
                    const bg = m.ret > 0
                      ? `rgba(16,185,129,${0.15 + intensity * 0.7})`
                      : m.ret < 0
                      ? `rgba(239,68,68,${0.15 + intensity * 0.7})`
                      : '#e5e7eb'
                    return (
                      <div
                        key={m.ym}
                        className={`rounded p-2 min-w-[72px] text-center text-xs ${m.isOOS ? 'ring-2 ring-orange-400' : ''}`}
                        style={{ backgroundColor: bg }}
                        title={`${m.ym}: ${m.ret.toFixed(2)}%${m.isOOS ? ' (OOS)' : ''}`}
                      >
                        <p className="font-medium text-gray-700 dark:text-gray-200">{m.ym.slice(2)}</p>
                        <p className="font-bold text-gray-900 dark:text-white">{m.ret.toFixed(1)}%</p>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">橘色邊框 = OOS 期間</p>
              </div>

              {/* Histogram */}
              <div className={sectionCls}>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">日報酬分布</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={histogramData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="bin" tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => `${v} 天`} labelFormatter={v => `${v}%`} />
                    <Bar dataKey="count" name="天數" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Rebal Logs */}
              <div className={sectionCls}>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                  換倉紀錄（共 {result.rebalLogs.length} 次）
                </h3>
                <div className="overflow-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">換倉日期</th>
                        <th className="px-2 py-1 text-left">IS/OOS</th>
                        <th className="px-2 py-1 text-left">選出產業</th>
                        <th className="px-2 py-1 text-left">新進(+)</th>
                        <th className="px-2 py-1 text-left">出場(-)</th>
                        <th className="px-2 py-1 text-left">持倉數</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rebalLogs.map((log, i) => (
                        <React.Fragment key={i}>
                          <tr
                            className={`border-t border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${log.isOOS ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}
                            onClick={() => setExpandedRebalIdx(expandedRebalIdx === i ? null : i)}
                          >
                            <td className="px-2 py-1">{log.date}</td>
                            <td className="px-2 py-1">
                              <span className={`px-1.5 py-0.5 rounded text-xs ${log.isOOS ? 'bg-orange-200 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                                {log.isOOS ? 'OOS' : 'IS'}
                              </span>
                            </td>
                            <td className="px-2 py-1 max-w-xs truncate">{log.selectedSubs.slice(0, 3).join(', ')}{log.selectedSubs.length > 3 ? '...' : ''}</td>
                            <td className="px-2 py-1 text-green-600">{log.entering.length > 0 ? `+${log.entering.length}` : '—'}</td>
                            <td className="px-2 py-1 text-red-500">{log.exiting.length > 0 ? `-${log.exiting.length}` : '—'}</td>
                            <td className="px-2 py-1">{log.holdingCount}</td>
                          </tr>
                          {expandedRebalIdx === i && log.filterDetails.length > 0 && (
                            <tr>
                              <td colSpan={6} className="px-2 py-2 bg-gray-50 dark:bg-gray-800">
                                <div className="overflow-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-gray-500">
                                        <th className="text-left px-1">Sub-industry</th>
                                        {config.subFilters.map((f, fi) => (
                                          <th key={fi} className="text-left px-1">
                                            {ALL_INDICATORS.find(ind => ind.key === f.indicator)?.label ?? f.indicator}
                                          </th>
                                        ))}
                                        <th className="text-left px-1">結果</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {log.filterDetails.map((fd, fi) => (
                                        <tr key={fi} className={fd.passed ? 'text-green-700 dark:text-green-400' : 'text-gray-400'}>
                                          <td className="px-1 py-0.5">{fd.subName}</td>
                                          {fd.conditions.map((cond, ci) => (
                                            <td key={ci} className="px-1 py-0.5">
                                              {cond.currVal !== null
                                                ? <span className={cond.passed ? 'text-green-600' : 'text-red-500'}>{cond.currVal.toFixed(2)}</span>
                                                : <span className="text-gray-400">—</span>}
                                            </td>
                                          ))}
                                          <td className="px-1 py-0.5">
                                            {fd.passed ? '✓' : '✗'}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Stop-loss exits */}
              {result.rebalLogs.some(l => l.exitedToday.length > 0) && (
                <div className={sectionCls}>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">停損出場紀錄</h3>
                  <div className="overflow-auto max-h-48">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="px-2 py-1 text-left">日期</th>
                          <th className="px-2 py-1 text-left">出場標的</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rebalLogs
                          .filter(l => l.exitedToday.length > 0)
                          .map((l, i) => (
                            <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                              <td className="px-2 py-1">{l.date}</td>
                              <td className="px-2 py-1 text-red-500">{l.exitedToday.join(', ')}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Latest Holdings */}
              {result.rebalLogs.length > 0 && (
                <div className={sectionCls}>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-3">最新持倉（最後一次換倉）</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.rebalLogs[result.rebalLogs.length - 1].selectedSubs.map((s, i) => (
                      <span
                        key={i}
                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-full text-xs font-medium"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab 3: Robustness ── */}
      {activeTab === 'robustness' && (
        <div>
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">參數穩健性測試</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className={`${labelCls} block mb-1`}>掃描參數</label>
                <select
                  value={robustParam}
                  onChange={e => setRobustParam(e.target.value)}
                  className={`${inputCls} w-full`}
                >
                  <option value="rebalPeriod">換倉週期</option>
                  <option value="bufferRule">Buffer Rule</option>
                  <option value="stopLoss">停損幅度</option>
                  <option value="topN">選股數量</option>
                  <option value="tradingCost">交易成本</option>
                </select>
              </div>
              <div className="flex gap-3">
                <div>
                  <label className={`${labelCls} block mb-1`}>從</label>
                  <input
                    type="number"
                    value={robustFrom}
                    onChange={e => setRobustFrom(parseFloat(e.target.value))}
                    className={`${inputCls} w-full`}
                  />
                </div>
                <div>
                  <label className={`${labelCls} block mb-1`}>到</label>
                  <input
                    type="number"
                    value={robustTo}
                    onChange={e => setRobustTo(parseFloat(e.target.value))}
                    className={`${inputCls} w-full`}
                  />
                </div>
                <div>
                  <label className={`${labelCls} block mb-1`}>步長</label>
                  <input
                    type="number"
                    value={robustStep}
                    onChange={e => setRobustStep(parseFloat(e.target.value))}
                    className={`${inputCls} w-full`}
                  />
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              將執行 {Math.ceil((robustTo - robustFrom) / Math.max(robustStep, 0.001)) + 1} 次回測
            </p>

            <button
              onClick={runRobustness}
              disabled={isRobustRunning || subHistory.length < 20}
              className={`px-6 py-2 rounded-lg text-white font-medium transition-colors ${
                isRobustRunning || subHistory.length < 20
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              {isRobustRunning ? '執行中...' : '▶ 執行穩健性測試'}
            </button>
          </div>

          {robustResults.length > 0 && (
            <>
              {robustStability && (
                <div className={`inline-block px-4 py-2 rounded-full text-sm font-semibold mb-4 ${robustStability.color}`}>
                  穩健性評估：{robustStability.text}
                </div>
              )}

              <div className={sectionCls}>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                  OOS Sharpe vs {robustParam}
                </h3>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart
                    data={robustResults.map(r => ({ param: r.param, oosS: r.oosS }))}
                    margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
                    onClick={(e) => {
                      if (e && e.activePayload) {
                        const pt = e.activePayload[0]?.payload as { param: number }
                        const found = robustResults.find(r => r.param === pt.param)
                        if (found) setSelectedRobustPoint({ param: found.param, perf: found.perf })
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="param" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => v.toFixed(3)} />
                    <Line type="monotone" dataKey="oosS" name="OOS Sharpe" stroke="#8b5cf6" dot={true} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>

                {selectedRobustPoint && (
                  <div className="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                    <h4 className="font-semibold text-purple-800 dark:text-purple-300 mb-2">
                      {robustParam} = {selectedRobustPoint.param}
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                      {[
                        ['年化報酬', `${selectedRobustPoint.perf.annRet}%`],
                        ['Sharpe', selectedRobustPoint.perf.sharpe.toFixed(2)],
                        ['Sortino', selectedRobustPoint.perf.sortino.toFixed(2)],
                        ['Max DD', `${selectedRobustPoint.perf.mdd.toFixed(1)}%`],
                        ['日勝率', `${selectedRobustPoint.perf.wr}%`],
                      ].map(([label, val]) => (
                        <div key={label} className="text-center">
                          <p className="text-xs text-purple-600 dark:text-purple-400">{label}</p>
                          <p className="font-bold text-purple-900 dark:text-purple-200">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className={sectionCls}>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">詳細結果表</h3>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-3 py-2 text-left">{robustParam}</th>
                      <th className="px-3 py-2 text-right">OOS Sharpe</th>
                      <th className="px-3 py-2 text-right">OOS 年化報酬</th>
                      <th className="px-3 py-2 text-right">OOS Max DD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {robustResults.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100 dark:border-gray-700">
                        <td className="px-3 py-2">{r.param}</td>
                        <td className="px-3 py-2 text-right font-medium">{r.oosS.toFixed(3)}</td>
                        <td className="px-3 py-2 text-right">{r.perf.annRet.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right text-red-500">{r.perf.mdd.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
