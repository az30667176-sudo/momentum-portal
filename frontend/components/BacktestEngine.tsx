'use client'

import React, { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer
} from 'recharts'
import {
  SubReturn,
  SubFilter, BacktestConfig,
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

// ── Indicator Hints (Task 3) ──────────────────────────────────

const INDICATOR_HINTS: Record<string, { range: string; suggestion: string }> = {
  information_ratio:      { range: '通常 -2 到 +3',      suggestion: '> 0.5 動能可靠，< 0 跑輸大盤' },
  momentum_decay_rate:    { range: '通常 -30 到 +30',     suggestion: '> 5 動能加速，< -5 動能衰退（出場預警）' },
  breadth_adj_mom:        { range: '通常 -20 到 +30',     suggestion: '> 10 廣泛且強勁，< 0 動能虛假' },
  rs_trend_slope:         { range: '通常 -0.05 到 +0.05', suggestion: '> 0 相對強度上升，< 0 弱化' },
  sortino_8w:             { range: '通常 -2 到 +5',       suggestion: '> 1.5 優良，0.8~1.5 尚可，< 0.8 偏差' },
  calmar_ratio:           { range: '通常 -1 到 +5',       suggestion: '> 2 優秀，0.5~2 尚可，< 0.5 風險高' },
  volatility_8w:          { range: '年化 %，通常 10 到 40', suggestion: '< 15 低波動，15~25 中等，> 25 高波動' },
  leader_lagger_ratio:    { range: '通常 0.2 到 5',       suggestion: '> 2 健康輪動，< 0.5 少數股票撐盤' },
  downside_capture:       { range: '通常 0.3 到 1.5',     suggestion: '< 0.7 防禦強，0.7~1.0 中性，> 1.0 高 beta' },
  cmf:                    { range: '-1 到 +1',            suggestion: '> 0.1 資金流入，< -0.1 資金流出' },
  mfi:                    { range: '0 到 100',            suggestion: '20~60 健康，> 80 超買警示，< 20 超賣' },
  pvt_slope:              { range: '極小數值（標準化後）',  suggestion: '> 0 資金持續流入，< 0 資金流出' },
  rvol:                   { range: '通常 0.2 到 3',        suggestion: '> 1.5 爆量，1.0~1.5 正常，< 0.7 量縮' },
  vol_surge_score:        { range: '0 到 100',            suggestion: '> 75 強烈量能訊號，50~75 溫和，< 25 量縮' },
  beta:                   { range: '通常 0.2 到 1.8',      suggestion: '< 0.8 獨立強勢，0.8~1.2 跟隨大盤，> 1.2 高相關' },
  momentum_autocorr:      { range: '-1 到 +1',            suggestion: '> 0.2 趨勢持續（適合趨勢策略），< -0.2 均值回歸' },
  price_trend_r2:         { range: '0 到 1',              suggestion: '> 0.85 趨勢乾淨，0.5~0.85 有震盪，< 0.5 高度震盪' },
}

// ── Indicator Details (Task 4) ────────────────────────────────

interface IndicatorDetail {
  group: string
  definition: string
  calculation: string
  useCases: string[]
  bestFilterTypes: string[]
}

const INDICATOR_DETAILS: Record<string, IndicatorDetail> = {
  cmf: {
    group: '資金流動', definition: 'Chaikin Money Flow，跨板塊標準化的資金流向指標',
    calculation: '近 20 日的 Money Flow Volume 加總 / 近 20 日總成交量，結果在 -1 到 +1 之間',
    useCases: ['正值代表資金淨流入，負值代表淨流出', '由負轉正時是資金開始流入的訊號', '跨產業比較最可靠（已標準化）'],
    bestFilterTypes: ['Crossover（由負轉正）', 'Static（≥ 0.05）'],
  },
  sortino_8w: {
    group: '風險調整', definition: '只懲罰下行波動的風險調整報酬指標',
    calculation: '超額週報酬均值 / 下行標準差 × sqrt(52)，年化',
    useCases: ['比 Sharpe 更符合投資人直覺（只懲罰虧損）', '高 Sortino 代表策略在控制下行風險上表現好', '適合週頻換倉策略的主要篩選指標'],
    bestFilterTypes: ['Static（≥ 1.0）', 'Rank Break（前 33%）'],
  },
  momentum_decay_rate: {
    group: '動能品質', definition: '動能加速或衰退的速度指標',
    calculation: '1M 動能百分位 - 3M 動能百分位（當日截面）',
    useCases: ['正數代表動能正在加速，負數代表動能衰退', '< -10 是強烈的出場預警訊號', '由負轉正代表動能從衰退轉為加速'],
    bestFilterTypes: ['Crossover（由負轉正）', 'Static（≥ 0）', 'Delta（上升 ≥ 5）'],
  },
  information_ratio: {
    group: '動能品質', definition: '衡量超額報酬的穩定性，動能是否真的跑贏大盤',
    calculation: '超額週報酬（vs SPY）均值 / 標準差 × sqrt(52)，年化',
    useCases: ['> 0.5 代表動能可靠且穩定', '< 0 代表雖然絕對報酬正但跑輸大盤', '比單純報酬更能反映動能的真實品質'],
    bestFilterTypes: ['Static（≥ 0.3）', 'Rank Break（前 25%）'],
  },
  beta: {
    group: '策略適性', definition: '板塊對大盤（SPY）的敏感度',
    calculation: 'cov(sub, SPY) / var(SPY)，滾動 52 週週報酬計算',
    useCases: ['低 Beta 代表板塊走勢獨立，動能更可信', '高 Beta 板塊在大盤下跌時會放大虧損', '配合 Downside Capture 一起看更完整'],
    bestFilterTypes: ['Static（≤ 0.8）', 'Rank Break（最低 N 個）'],
  },
  momentum_autocorr: {
    group: '策略適性', definition: '週報酬的 lag-1 自相關係數，衡量動能持續性',
    calculation: 'pearsonr(returns[:-1], returns[1:])，近 52 週週報酬',
    useCases: ['> 0.2 代表動能有持續性，適合趨勢跟隨策略', '< -0.2 代表均值回歸傾向，不適合週持倉', '-0.2 到 +0.2 動能方向不穩定'],
    bestFilterTypes: ['Static（≥ 0.1）', 'Crossover（由負轉正）'],
  },
  price_trend_r2: {
    group: '策略適性', definition: '價格對時間線性迴歸的 R²，衡量趨勢乾淨程度',
    calculation: '近 63 日（3M）收盤價 vs 時間的 OLS 迴歸 R²',
    useCases: ['> 0.85 代表趨勢極度乾淨，換倉時機好掌握', '< 0.5 代表高度震盪，不適合趨勢跟隨', '排除橫盤震盪的假動能板塊'],
    bestFilterTypes: ['Static（≥ 0.7）', 'Rank Break（前 33%）'],
  },
  breadth_adj_mom: {
    group: '動能品質', definition: '廣度調整後的動能，過濾少數股票撐盤的假動能',
    calculation: 'ret_3m × (breadth_pct / 100)',
    useCases: ['懲罰只有少數股票在漲的板塊', '高 BA Momentum 代表漲勢廣泛且真實', '避免選到「一檔大型股拉高整個板塊」的情況'],
    bestFilterTypes: ['Static（≥ 8）', 'Rank Break（前 25%）'],
  },
  rs_trend_slope: {
    group: '動能品質', definition: '相對強度趨勢斜率，衡量 RS 是否正在建立',
    calculation: '近 4 週 rs_ratio 的線性迴歸斜率',
    useCases: ['RS 正在上升比 RS 當前高更重要', '正斜率代表相對強度正在建立，是早期訊號', '負斜率代表相對強度正在弱化，準備出場'],
    bestFilterTypes: ['Crossover（由負轉正）', 'Static（≥ 0）'],
  },
  downside_capture: {
    group: '板塊結構', definition: '大盤下跌時的跟跌比例，衡量下行保護能力',
    calculation: 'SPY 週報酬為負時，sub-industry 平均下跌 / SPY 平均下跌',
    useCases: ['< 0.7 代表大盤跌時這個板塊跌得少，防禦性強', '> 1.0 代表跌得比大盤多，高 beta 特性', '週策略最重要的風險指標之一'],
    bestFilterTypes: ['Static（≤ 0.8）'],
  },
  leader_lagger_ratio: {
    group: '板塊結構', definition: '板塊內部跑贏 vs 跑輸自身均值的股票比例',
    calculation: '近 5 天均報酬 > 近 20 天均報酬的 ticker 數 / 跑輸的 ticker 數',
    useCases: ['> 2.0 代表板塊內部健康輪動，動能廣泛', '< 0.5 代表少數股票在撐場面，動能虛假', '配合 Breadth-Adj Momentum 一起使用效果更好'],
    bestFilterTypes: ['Static（≥ 1.5）', 'Rank Break（前 33%）'],
  },
  calmar_ratio: {
    group: '風險調整', definition: '年化報酬除以最大單週回撤，衡量風險效率',
    calculation: '近 12 週年化報酬 / abs(最差單週報酬)',
    useCases: ['> 2 代表用很小的下行風險獲得高報酬', '比 Sharpe 更直觀（最大虧損概念）', '適合厭惡突然大跌的策略'],
    bestFilterTypes: ['Static（≥ 1.0）', 'Rank Break（前 25%）'],
  },
  volatility_8w: {
    group: '風險調整', definition: '年化波動率，衡量報酬的穩定程度',
    calculation: '近 8 週週報酬標準差 × sqrt(52)，轉成年化百分比',
    useCases: ['低波動策略更適合週頻換倉', '< 15% 為低波動，> 25% 為高波動', '配合 Sortino 一起篩選風險控管好的板塊'],
    bestFilterTypes: ['Static（≤ 20）', 'Rank Break（最低 N 個）'],
  },
  mfi: {
    group: '資金流動', definition: 'Money Flow Index，量價版 RSI，0-100 標準化',
    calculation: '近 14 日 Positive MF / Negative MF，轉成 0-100',
    useCases: ['20~60 為健康區間，> 80 超買，< 20 超賣', '從 40 以下往上突破是強入場訊號', '跨產業可直接比較（0-100 標準化）'],
    bestFilterTypes: ['Static（介於 30-70）', 'Crossover（由低轉高）'],
  },
  pvt_slope: {
    group: '資金流動', definition: 'Price-Volume Trend 斜率，比 OBV 更精確的資金力道',
    calculation: 'cumsum(volume × pct_change) 近 8 週線性斜率，除以均量標準化',
    useCases: ['正斜率代表資金持續流入且力道增強', '比 OBV 更精確：漲 3% 的貢獻比漲 0.1% 大得多', '由負轉正是資金開始建倉的訊號'],
    bestFilterTypes: ['Crossover（由負轉正）', 'Static（≥ 0）'],
  },
  rvol: {
    group: '資金流動', definition: '相對成交量，今日量相對於近期均量的倍數',
    calculation: '當日成交量 / 近 20 日平均成交量',
    useCases: ['> 1.5 爆量，可能有重大事件或機構進場', '< 0.7 量縮，市場對此板塊興趣低', '配合 CMF 判斷爆量是買入還是賣出'],
    bestFilterTypes: ['Static（≥ 1.2）', 'Delta（上升 ≥ 0.5）'],
  },
  vol_surge_score: {
    group: '資金流動', definition: '標準化量能爆發分數（0-100），綜合連續放量、峰值、持續性',
    calculation: '連續高量週數 + RVol 峰值 + 近 8 週高量比例，三個子指標等權平均',
    useCases: ['> 75 代表強烈且持續的資金流入訊號', '比單週 RVol 更穩健（排除一次性爆量）', '連續三週以上放量才算真正的資金進場'],
    bestFilterTypes: ['Static（≥ 60）', 'Rank Break（前 25%）'],
  },
}

// ── Default Config ────────────────────────────────────────────

const DEFAULT_CONFIG: BacktestConfig = {
  subFilters: [],
  exitFilters: [],
  rankBy: 'mom_score',
  rankDir: 'desc',
  topN: 10,
  stockRankBy: 'mom_score',
  stocksPerSub: 3,
  rebalPeriod: 20,       // 20 trading days = 4W
  weightMode: 'equal',
  maxStockWeight: 20,    // per-stock max %
  maxSubWeight: 40,      // per-sub max %
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

// Engine is server-side only — see lib/backtestEngine.ts

// ── FilterBlock Component ─────────────────────────────────────

interface FilterBlockProps {
  filter: SubFilter
  onChange: (updated: SubFilter) => void
  onDelete: () => void
  onSelectIndicator?: (key: string) => void
}

function FilterBlock({ filter, onChange, onDelete, onSelectIndicator }: FilterBlockProps) {
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
            onChange={e => {
              onChange({ ...filter, indicator: e.target.value })
              onSelectIndicator?.(e.target.value)
            }}
            onClick={() => onSelectIndicator?.(filter.indicator)}
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
            {INDICATOR_HINTS[filter.indicator] && (
              <p className="w-full text-xs text-gray-400 mt-0.5">
                <span className="text-gray-500">[範圍：{INDICATOR_HINTS[filter.indicator].range}]</span>
                {'  '}
                <span className="text-gray-400">{INDICATOR_HINTS[filter.indicator].suggestion}</span>
              </p>
            )}
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
  prevData: SubReturn[]
}

// ── Main Component ────────────────────────────────────────────

export function BacktestEngine({ latestData, prevData }: Props) {
  const [activeTab, setActiveTab] = useState<'config' | 'results' | 'robustness'>('config')
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG)
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [robustParam, setRobustParam] = useState('rebalPeriod')
  const [robustFrom, setRobustFrom] = useState(1)
  const [robustTo, setRobustTo] = useState(8)
  const [robustStep, setRobustStep] = useState(1)
  const [robustResults, setRobustResults] = useState<{ param: number; oosS: number; perf: PerfMetrics }[]>([])
  const [isRobustRunning, setIsRobustRunning] = useState(false)
  const [rebalCustom, setRebalCustom] = useState(false)
  const [runPhase, setRunPhase] = useState<null | 'scanning' | 'loading' | 'running'>(null)
  const [scanInfo, setScanInfo] = useState<{ subCount: number; totalDays: number } | null>(null)
  const [selectedIndicatorKey, setSelectedIndicatorKey] = useState<string | null>(null)
  const [chartRange, setChartRange] = useState<'all' | 'is' | 'oos'>('all')
  const [selectedRobustPoint, setSelectedRobustPoint] = useState<{ param: number; perf: PerfMetrics } | null>(null)


  // Live preview
  const livePreview = useMemo(() => {
    if (!latestData || latestData.length === 0) return []
    const prevSubs = prevData.length > 0 ? prevData : latestData

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
  }, [latestData, config.subFilters, prevData])

  const runBacktest = useCallback(async () => {
    setIsRunning(true)
    setActiveTab('results')
    setScanInfo(null)

    // Check sessionStorage cache for dry-scan result
    const configKey = JSON.stringify({ subFilters: config.subFilters, rankBy: config.rankBy, rankDir: config.rankDir, topN: config.topN, rebalPeriod: config.rebalPeriod })
    const cacheKey = `dryscan_${configKey}`

    try {
      // Phase 1: Dry scan
      setRunPhase('scanning')
      let cachedScan: { subCount: number; totalDays: number } | null = null
      try {
        const cached = sessionStorage.getItem(cacheKey)
        if (cached) cachedScan = JSON.parse(cached)
      } catch {}

      if (!cachedScan) {
        const scanRes = await fetch('/api/dry-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ config }),
        })
        if (scanRes.ok) {
          const scanData = await scanRes.json()
          cachedScan = { subCount: scanData.subCount, totalDays: scanData.totalDays }
          try { sessionStorage.setItem(cacheKey, JSON.stringify(cachedScan)) } catch {}
        }
      }
      if (cachedScan) setScanInfo(cachedScan)

      // Phase 2: Loading stocks
      setRunPhase('loading')
      await new Promise(r => setTimeout(r, 400))  // brief visual pause

      // Phase 3: Run backtest
      setRunPhase('running')
      const res = await fetch('/api/run-backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        alert(error ?? '回測失敗')
        return
      }
      setResult(await res.json())
    } catch (err) {
      alert('回測失敗：' + String(err))
    } finally {
      setIsRunning(false)
      setRunPhase(null)
    }
  }, [config])

  const runRobustness = useCallback(async () => {
    setIsRobustRunning(true)
    setRobustResults([])
    const steps = Math.ceil((robustTo - robustFrom) / robustStep) + 1
    const values = Array.from({ length: steps }, (_, i) => robustFrom + i * robustStep)
    try {
      const res = await fetch('/api/run-robustness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, param: robustParam, values }),
      })
      if (!res.ok) {
        const { error } = await res.json()
        alert(error ?? '穩健性測試失敗')
        return
      }
      setRobustResults(await res.json())
    } catch (err) {
      alert('穩健性測試失敗：' + String(err))
    } finally {
      setIsRobustRunning(false)
    }
  }, [config, robustParam, robustFrom, robustTo, robustStep])

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
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Left: filter blocks */}
              <div className="flex-1 min-w-0">
                {config.subFilters.map((f, idx) => (
                  <FilterBlock
                    key={f.id}
                    filter={f}
                    onChange={updated => updateSubFilter(idx, updated)}
                    onDelete={() => deleteSubFilter(idx)}
                    onSelectIndicator={setSelectedIndicatorKey}
                  />
                ))}
                <button
                  onClick={addSubFilter}
                  className="mt-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  + 新增篩選條件
                </button>
              </div>

              {/* Right: indicator detail card (Task 4) */}
              <div className="lg:w-72 shrink-0">
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-900 min-h-[120px]">
                  {!selectedIndicatorKey || !INDICATOR_DETAILS[selectedIndicatorKey] ? (
                    <p className="text-xs text-gray-400 italic">選擇一個指標以查看說明</p>
                  ) : (() => {
                    const d = INDICATOR_DETAILS[selectedIndicatorKey]
                    return (
                      <>
                        <p className="text-xs font-medium text-blue-500 dark:text-blue-400 mb-0.5">{d.group}</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                          {ALL_INDICATORS.find(i => i.key === selectedIndicatorKey)?.label ?? selectedIndicatorKey}
                        </p>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">定義</p>
                        <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">{d.definition}</p>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">計算方式</p>
                        <p className="text-xs text-gray-700 dark:text-gray-300 mb-2">{d.calculation}</p>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">使用情境</p>
                        <ul className="mb-2">
                          {d.useCases.map((u, i) => (
                            <li key={i} className="text-xs text-gray-700 dark:text-gray-300">· {u}</li>
                          ))}
                        </ul>
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">建議篩選類型</p>
                        <div className="flex flex-wrap gap-1">
                          {d.bestFilterTypes.map((t, i) => (
                            <span key={i} className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                              {t}
                            </span>
                          ))}
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            </div>

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
          </div>

          {/* Section C: Rebal & Position */}
          <div className={sectionCls}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              C. 換倉 &amp; 部位設定
            </h2>

            <div className="mb-4">
              <p className={`${labelCls} mb-2`}>換倉週期</p>
              <div className="flex gap-2 flex-wrap">
                {([5, 10, 20, 40] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => { setConfig(c => ({ ...c, rebalPeriod: p })); setRebalCustom(false) }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      !rebalCustom && config.rebalPeriod === p
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {p === 5 ? '1W' : p === 10 ? '2W' : p === 20 ? '4W' : '8W'}
                  </button>
                ))}
                <button
                  onClick={() => setRebalCustom(true)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    rebalCustom
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  自訂
                </button>
              </div>
              {rebalCustom && (
                <div className="mt-2 flex items-center gap-2">
                  <span className={`${labelCls} text-sm`}>換倉週期：</span>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={config.rebalPeriod}
                    onChange={e => setConfig(c => ({ ...c, rebalPeriod: Math.min(90, Math.max(1, parseInt(e.target.value) || 1)) }))}
                    className={`${inputCls} w-20`}
                  />
                  <span className={labelCls}>個交易日</span>
                  <p className="text-xs text-gray-400 ml-2">1 = 每日換倉，5 = 每週，10 = 每兩週</p>
                </div>
              )}
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className={`${labelCls} mb-1`}>單一個股上限：{config.maxStockWeight}%</p>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={config.maxStockWeight}
                  onChange={e => setConfig(c => ({ ...c, maxStockWeight: parseInt(e.target.value) }))}
                  className="w-full accent-blue-600"
                />
                <p className="text-xs text-gray-400 mt-1">每檔個股的最大持倉比例</p>
              </div>
              <div>
                <p className={`${labelCls} mb-1`}>單一產業上限：{config.maxSubWeight}%</p>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={10}
                  value={config.maxSubWeight}
                  onChange={e => setConfig(c => ({ ...c, maxSubWeight: parseInt(e.target.value) }))}
                  className="w-full accent-indigo-500"
                />
                <p className="text-xs text-gray-400 mt-1">同一個 sub-industry 的所有個股合計上限</p>
              </div>
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
                  onSelectIndicator={setSelectedIndicatorKey}
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
              <p className="text-xs text-gray-400 mt-1">建議：2 年 IS + 1 年 OOS，至少需要 1 年 OOS 才有統計意義</p>
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
              disabled={isRunning}
              className={`w-full py-3 rounded-xl text-white font-semibold text-base transition-colors ${
                isRunning
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isRunning
                ? (runPhase === 'scanning' ? '掃描中...' : runPhase === 'loading' ? '載入資料...' : '計算中...')
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
                {runPhase === 'scanning' && (
                  <p className="text-gray-600 dark:text-gray-400">掃描產業選取範圍...</p>
                )}
                {runPhase === 'loading' && (
                  <div>
                    <p className="text-gray-600 dark:text-gray-400">
                      載入個股歷史資料
                      {scanInfo ? `（共 ${scanInfo.subCount} 個產業）` : ''}...
                    </p>
                    {!scanInfo && (
                      <p className="text-xs text-orange-500 mt-2">
                        個股資料尚未回填，回測將以 sub-industry 等權替代。
                        建議執行：python pipeline/main.py --backfill --years 3
                      </p>
                    )}
                  </div>
                )}
                {runPhase === 'running' && (
                  <p className="text-gray-600 dark:text-gray-400">
                    執行回測...
                    {scanInfo ? `（${scanInfo.totalDays} 個交易日）` : ''}
                  </p>
                )}
                {!runPhase && (
                  <p className="text-gray-600 dark:text-gray-400">計算中，請稍候...</p>
                )}
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

              {/* Monthly Heatmap (Task 5E: supports multi-year) */}
              <div className={sectionCls}>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">月度報酬熱圖</h3>
                {(() => {
                  // Group by year for multi-year layout
                  const byYear: Record<string, typeof monthlyData> = {}
                  monthlyData.forEach(m => {
                    const y = m.ym.slice(0, 4)
                    if (!byYear[y]) byYear[y] = []
                    byYear[y].push(m)
                  })
                  return (
                    <div className="space-y-2">
                      {Object.entries(byYear).map(([year, months]) => (
                        <div key={year}>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{year}</p>
                          <div className="flex flex-wrap gap-1">
                            {months.map(m => {
                              const intensity = Math.min(Math.abs(m.ret) / 5, 1)
                              const bg = m.ret > 0
                                ? `rgba(16,185,129,${0.15 + intensity * 0.7})`
                                : m.ret < 0
                                ? `rgba(239,68,68,${0.15 + intensity * 0.7})`
                                : '#e5e7eb'
                              return (
                                <div
                                  key={m.ym}
                                  className={`rounded p-1.5 w-[62px] text-center text-xs ${m.isOOS ? 'ring-2 ring-orange-400' : ''}`}
                                  style={{ backgroundColor: bg }}
                                  title={`${m.ym}: ${m.ret.toFixed(2)}%${m.isOOS ? ' (OOS)' : ''}`}
                                >
                                  <p className="font-medium text-gray-700 dark:text-gray-200">{m.ym.slice(5)}</p>
                                  <p className="font-bold text-gray-900 dark:text-white">{m.ret.toFixed(1)}%</p>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
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

              {/* Rebal Logs — compact summary */}
              <div className={sectionCls}>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                  換倉紀錄（共 {result.rebalLogs.length} 次）
                </h3>
                <div className="overflow-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">換倉日期</th>
                        <th className="px-2 py-1 text-left">IS/OOS</th>
                        <th className="px-2 py-1 text-right">選出產業</th>
                        <th className="px-2 py-1 text-right">新進個股</th>
                        <th className="px-2 py-1 text-right">出場個股</th>
                        <th className="px-2 py-1 text-right">持倉總數</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rebalLogs.map((log, i) => (
                        <tr key={i} className={`border-t border-gray-100 dark:border-gray-700 ${log.isOOS ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}>
                          <td className="px-2 py-1">{log.date}</td>
                          <td className="px-2 py-1">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${log.isOOS ? 'bg-orange-200 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                              {log.isOOS ? 'OOS' : 'IS'}
                            </span>
                          </td>
                          <td className="px-2 py-1 text-right">{log.selectedSubs.length}</td>
                          <td className="px-2 py-1 text-right text-green-600">{log.stockEntriesCount > 0 ? `+${log.stockEntriesCount}` : '—'}</td>
                          <td className="px-2 py-1 text-right text-red-500">{log.stockExitsCount > 0 ? `-${log.stockExitsCount}` : '—'}</td>
                          <td className="px-2 py-1 text-right">{log.holdingCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Flat Trade History */}
              {result.tradeHistory.length > 0 && (() => {
                const exitReasonLabel: Record<string, string> = {
                  rebal: '換倉', stop_loss: '固定停損', trailing_stop: '追蹤停損',
                  take_profit: '停利', time_stop: '時間停損', signal: '訊號出場',
                }
                const exitColor = (r: string) =>
                  r === 'stop_loss' || r === 'trailing_stop' ? 'text-red-500'
                  : r === 'take_profit' ? 'text-green-600'
                  : r === 'signal' ? 'text-yellow-600'
                  : 'text-gray-400'
                // Detect real ticker: not an 8-char uppercase hex (gics_code fallback)
                const isRealTicker = (t: string) => !/^[0-9A-F]{8}$/.test(t)
                const sorted = [...result.tradeHistory].sort((a, b) => a.entryDate.localeCompare(b.entryDate))
                const winCount = sorted.filter(t => t.pnlPct > 0).length
                return (
                  <div className={sectionCls}>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      個股交易明細（共 {sorted.length} 筆）
                    </h3>
                    <p className="text-xs text-gray-400 mb-3">
                      勝率 {sorted.length > 0 ? Math.round(winCount / sorted.length * 100) : 0}%　·　損益為 ret_1d 複利估算，不含交易成本
                    </p>
                    <div className="overflow-auto max-h-96">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                          <tr>
                            <th className="px-2 py-1 text-left">股票</th>
                            <th className="px-2 py-1 text-left">所屬產業</th>
                            <th className="px-2 py-1 text-left">入場日</th>
                            <th className="px-2 py-1 text-left">出場日</th>
                            <th className="px-2 py-1 text-right">持有天</th>
                            <th className="px-2 py-1 text-right">持倉比重</th>
                            <th className="px-2 py-1 text-right">損益%</th>
                            <th className="px-2 py-1 text-left">出場原因</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map((t, i) => (
                            <tr key={i} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                              <td className="px-2 py-1 font-mono">
                                {isRealTicker(t.ticker) ? (
                                  <a
                                    href={`https://finance.yahoo.com/quote/${t.ticker}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline dark:text-blue-400"
                                  >
                                    {t.ticker}
                                  </a>
                                ) : (
                                  <span className="text-gray-400 text-[10px]">{t.subName.slice(0, 8)}</span>
                                )}
                              </td>
                              <td className="px-2 py-1 max-w-[140px] truncate text-gray-500">{t.subName}</td>
                              <td className="px-2 py-1 text-gray-500">{t.entryDate}</td>
                              <td className="px-2 py-1 text-gray-500">{t.exitDate}</td>
                              <td className="px-2 py-1 text-right text-gray-500">{t.holdingDays}</td>
                              <td className="px-2 py-1 text-right text-gray-500">
                                {t.weight != null ? `${(t.weight * 100).toFixed(1)}%` : '—'}
                              </td>
                              <td className={`px-2 py-1 text-right font-semibold ${t.pnlPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(2)}%
                              </td>
                              <td className={`px-2 py-1 ${exitColor(t.exitReason)}`}>{exitReasonLabel[t.exitReason] ?? t.exitReason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}

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
              disabled={isRobustRunning}
              className={`px-6 py-2 rounded-lg text-white font-medium transition-colors ${
                isRobustRunning
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
