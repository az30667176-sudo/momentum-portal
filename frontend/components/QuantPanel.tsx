'use client'

import { SubReturn } from '@/lib/types'

interface MetricCard {
  key: keyof SubReturn
  label: string
  desc: string
  format: (v: number | string | null) => string
  bar?: { min: number; max: number; reverse?: boolean }
  group: 'momentum' | 'volume'
}

const METRICS: MetricCard[] = [
  // ── Momentum (12) ──────────────────────────────────────────
  {
    key: 'ret_1d', label: '1D Return', group: 'momentum',
    desc: '昨日報酬率',
    format: (v) => v != null ? `${(+v >= 0 ? '+' : '')}${(+v).toFixed(2)}%` : '—',
    bar: { min: -5, max: 5 },
  },
  {
    key: 'ret_1w', label: '1W Return', group: 'momentum',
    desc: '近 5 個交易日報酬',
    format: (v) => v != null ? `${(+v >= 0 ? '+' : '')}${(+v).toFixed(2)}%` : '—',
    bar: { min: -10, max: 10 },
  },
  {
    key: 'ret_1m', label: '1M Return', group: 'momentum',
    desc: '近 21 個交易日報酬',
    format: (v) => v != null ? `${(+v >= 0 ? '+' : '')}${(+v).toFixed(1)}%` : '—',
    bar: { min: -15, max: 15 },
  },
  {
    key: 'ret_3m', label: '3M Return', group: 'momentum',
    desc: '近 63 個交易日報酬',
    format: (v) => v != null ? `${(+v >= 0 ? '+' : '')}${(+v).toFixed(1)}%` : '—',
    bar: { min: -25, max: 25 },
  },
  {
    key: 'ret_6m', label: '6M Return', group: 'momentum',
    desc: '近 126 個交易日報酬',
    format: (v) => v != null ? `${(+v >= 0 ? '+' : '')}${(+v).toFixed(1)}%` : '—',
    bar: { min: -35, max: 35 },
  },
  {
    key: 'ret_12m', label: '12M Return', group: 'momentum',
    desc: '近 252 個交易日報酬',
    format: (v) => v != null ? `${(+v >= 0 ? '+' : '')}${(+v).toFixed(1)}%` : '—',
    bar: { min: -50, max: 50 },
  },
  {
    key: 'mom_6m', label: 'Mom 6M (skip)', group: 'momentum',
    desc: 'Skip-month 6M 動能：跳過最近 22 日，計算 t-132 到 t-22 的報酬，避免短期反轉',
    format: (v) => v != null ? `${(+v >= 0 ? '+' : '')}${(+v).toFixed(1)}%` : '—',
    bar: { min: -30, max: 30 },
  },
  {
    key: 'mom_12m', label: 'Mom 12M (skip)', group: 'momentum',
    desc: 'Skip-month 12M 動能：跳過最近 22 日，計算 t-252 到 t-22 的報酬',
    format: (v) => v != null ? `${(+v >= 0 ? '+' : '')}${(+v).toFixed(1)}%` : '—',
    bar: { min: -50, max: 50 },
  },
  {
    key: 'mom_score', label: 'Mom Score', group: 'momentum',
    desc: '綜合動能分數（0–100）：0.5×Z(ret_3m) + 0.5×Z(ret_6m) 轉為百分位',
    format: (v) => v != null ? `${(+v).toFixed(1)}` : '—',
    bar: { min: 0, max: 100 },
  },
  {
    key: 'rank_today', label: 'Rank', group: 'momentum',
    desc: '截面排名（1=最強動能）',
    format: (v) => v != null ? `#${v}` : '—',
    bar: { min: 1, max: 155, reverse: true },
  },
  {
    key: 'delta_rank', label: 'ΔRank', group: 'momentum',
    desc: '排名相對上週的變化（正數=進步，往前移動）',
    format: (v) => v != null ? `${+v > 0 ? '+' : ''}${v}` : '—',
    bar: { min: -20, max: 20 },
  },
  {
    key: 'stock_count', label: 'Stock Count', group: 'momentum',
    desc: '本 sub-industry 有效成分股數量',
    format: (v) => v != null ? `${v}` : '—',
    bar: { min: 0, max: 30 },
  },
  // ── Volume / Price (4) ──────────────────────────────────────
  {
    key: 'rvol', label: 'RVol', group: 'volume',
    desc: '相對成交量：今日 / 過去 20 日均量。>1.5 爆量，<0.7 量縮',
    format: (v) => v != null ? `${(+v).toFixed(2)}x` : '—',
    bar: { min: 0, max: 3 },
  },
  {
    key: 'vol_mom', label: 'Vol Momentum', group: 'volume',
    desc: '成交量動能：近 4 週均量 / 前 4 週均量。>1.2 擴張，<0.85 萎縮',
    format: (v) => v != null ? `${(+v).toFixed(2)}x` : '—',
    bar: { min: 0, max: 2 },
  },
  {
    key: 'obv_trend', label: 'OBV Trend', group: 'volume',
    desc: 'On-Balance Volume 近 8 週線性斜率（標準化）。正值=資金流入',
    format: (v) => v != null ? `${(+v >= 0 ? '+' : '')}${(+v).toFixed(4)}` : '—',
    bar: { min: -0.1, max: 0.1 },
  },
  {
    key: 'pv_divergence', label: 'PV Signal', group: 'volume',
    desc: '量價訊號：confirmed（量增價漲）/ price_vol_neg（量縮價漲）/ capitulation（量增價跌）/ weak（量縮價跌）',
    format: (v) => {
      const labels: Record<string, string> = {
        confirmed: '✓ Confirmed',
        price_vol_neg: '⚠ Vol Neg',
        capitulation: '↩ Capitulation',
        weak: '✗ Weak',
      }
      return v != null ? (labels[String(v)] ?? String(v)) : '—'
    },
  },
]

function ProgressBar({
  value,
  min,
  max,
  reverse = false,
  positive,
}: {
  value: number
  min: number
  max: number
  reverse?: boolean
  positive: boolean
}) {
  const clipped = Math.max(min, Math.min(max, value))
  const pct = ((clipped - min) / (max - min)) * 100
  const fill = reverse ? (positive ? 'bg-green-500' : 'bg-red-400') : (positive ? 'bg-green-500' : 'bg-red-400')

  // Center-based bar for metrics that can be positive or negative
  const mid = ((0 - min) / (max - min)) * 100
  const isCentered = min < 0 && max > 0

  return (
    <div className="relative h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
      {isCentered ? (
        <>
          <div
            className={`absolute h-full ${fill} rounded-full`}
            style={{
              left: `${Math.min(pct, mid)}%`,
              width: `${Math.abs(pct - mid)}%`,
            }}
          />
          <div className="absolute h-full w-px bg-gray-400 dark:bg-gray-500" style={{ left: `${mid}%` }} />
        </>
      ) : (
        <div
          className={`absolute h-full ${fill} rounded-full`}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  )
}

interface Props {
  data: SubReturn
}

export function QuantPanel({ data }: Props) {
  const momentumMetrics = METRICS.filter(m => m.group === 'momentum')
  const volumeMetrics = METRICS.filter(m => m.group === 'volume')

  function renderCard(m: MetricCard) {
    const raw = data[m.key]
    const display = m.format(raw as number | string | null)
    const numVal = typeof raw === 'number' ? raw : null
    const isPositive = numVal !== null ? numVal >= 0 : true
    const hasBar = m.bar && numVal !== null

    return (
      <div
        key={m.key}
        className={`rounded-lg p-3 border ${
          m.group === 'volume'
            ? 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
        }`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">{m.label}</div>
          <div
            className={`text-sm font-bold ${
              m.key === 'pv_divergence'
                ? 'text-gray-700 dark:text-gray-300'
                : numVal !== null && m.key !== 'rank_today' && m.key !== 'stock_count'
                  ? (isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400')
                  : 'text-gray-800 dark:text-gray-200'
            }`}
          >
            {display}
          </div>
        </div>

        {hasBar && m.bar && (
          <ProgressBar
            value={numVal!}
            min={m.bar.min}
            max={m.bar.max}
            reverse={m.bar.reverse}
            positive={isPositive}
          />
        )}

        <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 leading-tight">
          {m.desc}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">
        Momentum Metrics
        <span className="ml-2 text-xs font-normal text-gray-400">(12 indicators)</span>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-6">
        {momentumMetrics.map(renderCard)}
      </div>

      <h3 className="text-sm font-semibold text-purple-600 dark:text-purple-400 mb-3">
        Volume / Price Metrics
        <span className="ml-2 text-xs font-normal text-purple-400">(4 indicators)</span>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {volumeMetrics.map(renderCard)}
      </div>
    </div>
  )
}
