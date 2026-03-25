'use client'

import { SubReturn } from '@/lib/types'

// ── Progress Bar ───────────────────────────────────────────────

function ProgressBar({
  value,
  min,
  max,
  color,
}: {
  value: number
  min: number
  max: number
  color: string
}) {
  const clipped = Math.max(min, Math.min(max, value))
  const pct = ((clipped - min) / (max - min)) * 100
  const mid = ((0 - min) / (max - min)) * 100
  const isCentered = min < 0 && max > 0

  return (
    <div className="relative h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-2">
      {isCentered ? (
        <>
          <div
            className={`absolute h-full ${color} rounded-full`}
            style={{
              left: `${Math.min(pct, mid)}%`,
              width: `${Math.abs(pct - mid)}%`,
            }}
          />
          <div
            className="absolute h-full w-px bg-gray-400 dark:bg-gray-500"
            style={{ left: `${mid}%` }}
          />
        </>
      ) : (
        <div className={`absolute h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────

function fmtNum(v: number | null, decimals = 2): string {
  if (v == null) return '—'
  return v.toFixed(decimals)
}

function fmtPct(v: number | null, decimals = 2): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}%`
}

// ── Card components ────────────────────────────────────────────

interface CardProps {
  label: string
  value: string
  desc: string
  valueColor: string
  barColor?: string
  barMin?: number
  barMax?: number
  barValue?: number | null
  extra?: React.ReactNode
}

function MetricCard({ label, value, desc, valueColor, barColor, barMin, barMax, barValue, extra }: CardProps) {
  return (
    <div className="rounded-lg p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between gap-1">
        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</div>
        <div className={`text-sm font-bold ${valueColor}`}>{value}</div>
      </div>
      {barValue != null && barColor && barMin != null && barMax != null && (
        <ProgressBar value={barValue} min={barMin} max={barMax} color={barColor} />
      )}
      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 leading-tight">{desc}</div>
      {extra}
    </div>
  )
}

// Determine color class based on thresholds
// zones: [{threshold, color, direction}] — "above" means value >= threshold
function thresholdColor(
  v: number | null,
  zones: Array<{ t: number; color: string; above: boolean }>,
  defaultColor = 'text-gray-500 dark:text-gray-400',
): string {
  if (v == null) return defaultColor
  for (const z of zones) {
    if (z.above ? v >= z.t : v < z.t) return z.color
  }
  return defaultColor
}

const GREEN = 'text-green-600 dark:text-green-400'
const YELLOW = 'text-yellow-600 dark:text-yellow-400'
const RED = 'text-red-500 dark:text-red-400'
const BLUE = 'text-blue-500 dark:text-blue-400'
const GRAY = 'text-gray-500 dark:text-gray-400'

const BAR_GREEN = 'bg-green-500'
const BAR_YELLOW = 'bg-yellow-400'
const BAR_RED = 'bg-red-400'
const BAR_GRAY = 'bg-gray-400'

function barColorFor(colorClass: string): string {
  if (colorClass.includes('green')) return BAR_GREEN
  if (colorClass.includes('yellow')) return BAR_YELLOW
  if (colorClass.includes('red')) return BAR_RED
  if (colorClass.includes('blue')) return 'bg-blue-400'
  return BAR_GRAY
}

// ── PV Divergence badge ────────────────────────────────────────

const PV_BADGES: Record<string, { label: string; cls: string }> = {
  confirmed:     { label: '量價齊揚', cls: 'bg-green-100 text-green-700 border-green-300' },
  price_vol_neg: { label: '量縮價漲', cls: 'bg-red-100 text-red-700 border-red-300' },
  capitulation:  { label: '量增價跌', cls: 'bg-blue-100 text-blue-700 border-blue-300' },
  weak:          { label: '量縮價跌', cls: 'bg-gray-100 text-gray-500 border-gray-300' },
}

function PvBadge({ pv }: { pv: string | null }) {
  if (!pv || !PV_BADGES[pv]) return null
  const b = PV_BADGES[pv]
  return (
    <span className={`mt-1.5 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${b.cls}`}>
      {b.label}
    </span>
  )
}

// ── Group header ───────────────────────────────────────────────

function GroupHeader({ zh, en }: { zh: string; en: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        {zh}
        <span className="ml-2 text-xs font-normal text-gray-400">{en}</span>
      </div>
      <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────

interface Props {
  data: SubReturn
}

export function QuantPanel({ data: d }: Props) {
  // ── Group 1: Momentum Quality ──────────────────────────────

  const irColor = thresholdColor(d.information_ratio, [
    { t: 0.5, color: GREEN, above: true },
    { t: 0,   color: YELLOW, above: true },
  ], RED)

  const decayColor = thresholdColor(d.momentum_decay_rate, [
    { t: 5,  color: GREEN,  above: true },
    { t: -5, color: GRAY,   above: true },
  ], RED)

  const breadthColor = thresholdColor(d.breadth_adj_mom, [
    { t: 10, color: GREEN,  above: true },
    { t: 0,  color: YELLOW, above: true },
  ], RED)

  const rsColor = d.rs_trend_slope != null
    ? (d.rs_trend_slope > 0 ? GREEN : RED)
    : GRAY

  // ── Group 2: Risk-Adjusted ─────────────────────────────────

  const sortinoColor = thresholdColor(d.sortino_8w, [
    { t: 1.5, color: GREEN,  above: true },
    { t: 0.8, color: YELLOW, above: true },
  ], RED)

  const calmarColor = thresholdColor(d.calmar_ratio, [
    { t: 2,   color: GREEN,  above: true },
    { t: 0.5, color: YELLOW, above: true },
  ], RED)

  // Volatility: lower is better
  const volColor = thresholdColor(d.volatility_8w, [
    { t: 25, color: RED,    above: true },
    { t: 15, color: YELLOW, above: true },
  ], GREEN)

  // ── Group 3: Sector Structure ──────────────────────────────

  const llColor = thresholdColor(d.leader_lagger_ratio, [
    { t: 2.0, color: GREEN,  above: true },
    { t: 0.5, color: YELLOW, above: true },
  ], RED)

  // Downside Capture: lower is better
  const dcColor = thresholdColor(d.downside_capture, [
    { t: 1.0, color: RED,    above: true },
    { t: 0.7, color: YELLOW, above: true },
  ], GREEN)

  // ── Group 4: Flow Analysis ─────────────────────────────────

  const cmfColor = thresholdColor(d.cmf, [
    { t: 0.1,  color: GREEN, above: true },
    { t: -0.1, color: GRAY,  above: true },
  ], RED)

  const mfiColor = (() => {
    if (d.mfi == null) return GRAY
    if (d.mfi > 80) return RED
    if (d.mfi < 20) return BLUE
    return GREEN
  })()

  const pvtColor = d.pvt_slope != null ? (d.pvt_slope > 0 ? GREEN : RED) : GRAY

  const rvolColor = (() => {
    if (d.rvol == null) return GRAY
    if (d.rvol >= 1.5) return YELLOW
    if (d.rvol >= 1.0) return GREEN
    return GRAY
  })()

  const vsColor = thresholdColor(d.vol_surge_score, [
    { t: 75, color: GREEN,  above: true },
    { t: 50, color: YELLOW, above: true },
  ], GRAY)

  // ── Group 5: Strategy Fitness ──────────────────────────────

  // Beta: lower is better
  const betaColor = thresholdColor(d.beta, [
    { t: 1.2, color: RED,    above: true },
    { t: 0.8, color: YELLOW, above: true },
  ], GREEN)

  const autocorrColor = thresholdColor(d.momentum_autocorr, [
    { t: 0.2,  color: GREEN, above: true },
    { t: -0.2, color: GRAY,  above: true },
  ], BLUE)

  const autocorrLabel = (() => {
    if (d.momentum_autocorr == null) return null
    if (d.momentum_autocorr > 0.2)  return <span className="mt-1 block text-[10px] text-green-600 dark:text-green-400">適合趨勢策略</span>
    if (d.momentum_autocorr < -0.2) return <span className="mt-1 block text-[10px] text-blue-500 dark:text-blue-400">適合均值回歸</span>
    return <span className="mt-1 block text-[10px] text-gray-400">動能不穩定</span>
  })()

  const r2Color = thresholdColor(d.price_trend_r2, [
    { t: 0.85, color: GREEN,  above: true },
    { t: 0.5,  color: YELLOW, above: true },
  ], RED)

  return (
    <div className="space-y-6">

      {/* ── Group 1: Momentum Quality ── */}
      <div>
        <GroupHeader zh="動能品質" en="Momentum Quality" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard
            label="Information Ratio"
            value={fmtNum(d.information_ratio, 2)}
            desc="超額報酬穩定性，動能是否真的跑贏大盤"
            valueColor={irColor}
            barColor={barColorFor(irColor)}
            barMin={-1} barMax={2} barValue={d.information_ratio}
          />
          <MetricCard
            label="Momentum Decay"
            value={fmtNum(d.momentum_decay_rate, 1)}
            desc="動能加速或衰退，負數是出場預警"
            valueColor={decayColor}
            barColor={barColorFor(decayColor)}
            barMin={-30} barMax={30} barValue={d.momentum_decay_rate}
          />
          <MetricCard
            label="Breadth-Adj Mom"
            value={fmtNum(d.breadth_adj_mom, 2)}
            desc="廣度調整動能，過濾少數股票撐盤的假動能"
            valueColor={breadthColor}
            barColor={barColorFor(breadthColor)}
            barMin={-20} barMax={30} barValue={d.breadth_adj_mom}
          />
          <MetricCard
            label="RS Trend Slope"
            value={d.rs_trend_slope != null ? d.rs_trend_slope.toFixed(4) : '—'}
            desc="相對強度趨勢斜率，正數代表 RS 正在建立"
            valueColor={rsColor}
            barColor={barColorFor(rsColor)}
            barMin={-0.01} barMax={0.01} barValue={d.rs_trend_slope}
          />
        </div>
      </div>

      {/* ── Group 2: Risk-Adjusted ── */}
      <div>
        <GroupHeader zh="風險調整" en="Risk-Adjusted" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard
            label="Sortino Ratio"
            value={fmtNum(d.sortino_8w, 2)}
            desc="只懲罰下行波動，比 Sharpe 更實用"
            valueColor={sortinoColor}
            barColor={barColorFor(sortinoColor)}
            barMin={-2} barMax={5} barValue={d.sortino_8w}
          />
          <MetricCard
            label="Calmar Ratio"
            value={fmtNum(d.calmar_ratio, 2)}
            desc="年化報酬除以最大單週回撤"
            valueColor={calmarColor}
            barColor={barColorFor(calmarColor)}
            barMin={-2} barMax={6} barValue={d.calmar_ratio}
          />
          <MetricCard
            label="Volatility (ann.)"
            value={d.volatility_8w != null ? `${d.volatility_8w.toFixed(1)}%` : '—'}
            desc="年化波動率，低波動更適合週策略"
            valueColor={volColor}
            barColor={barColorFor(volColor)}
            barMin={0} barMax={60} barValue={d.volatility_8w}
          />
        </div>
      </div>

      {/* ── Group 3: Sector Structure ── */}
      <div>
        <GroupHeader zh="板塊結構" en="Sector Structure" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard
            label="Leader / Lagger"
            value={fmtNum(d.leader_lagger_ratio, 2)}
            desc="跑贏 vs 跑輸自身均值的股票比例"
            valueColor={llColor}
            barColor={barColorFor(llColor)}
            barMin={0} barMax={5} barValue={d.leader_lagger_ratio}
          />
          <MetricCard
            label="Downside Capture"
            value={fmtNum(d.downside_capture, 2)}
            desc="大盤下跌時的跟跌比例，越低越有保護"
            valueColor={dcColor}
            barColor={barColorFor(dcColor)}
            barMin={0} barMax={2} barValue={d.downside_capture}
          />
        </div>
      </div>

      {/* ── Group 4: Flow Analysis ── */}
      <div>
        <GroupHeader zh="資金流動" en="Flow Analysis" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard
            label="CMF"
            value={fmtNum(d.cmf, 3)}
            desc="Chaikin Money Flow，-1 到 +1，跨板塊標準化資金流向"
            valueColor={cmfColor}
            barColor={barColorFor(cmfColor)}
            barMin={-1} barMax={1} barValue={d.cmf}
            extra={<PvBadge pv={d.pv_divergence} />}
          />
          <MetricCard
            label="MFI"
            value={d.mfi != null ? Math.round(d.mfi).toString() : '—'}
            desc="量價版 RSI，0-100，> 80 超買，< 20 超賣"
            valueColor={mfiColor}
            barColor={barColorFor(mfiColor)}
            barMin={0} barMax={100} barValue={d.mfi}
          />
          <MetricCard
            label="PVT Slope"
            value={d.pvt_slope != null ? d.pvt_slope.toFixed(4) : '—'}
            desc="量價趨勢斜率，資金流入力道指標"
            valueColor={pvtColor}
            barColor={barColorFor(pvtColor)}
            barMin={-0.01} barMax={0.01} barValue={d.pvt_slope}
          />
          <MetricCard
            label="RVol"
            value={d.rvol != null ? `${d.rvol.toFixed(2)}x` : '—'}
            desc="當日成交量 / 過去 20 日均量"
            valueColor={rvolColor}
            barColor={barColorFor(rvolColor)}
            barMin={0} barMax={3} barValue={d.rvol}
          />
          <MetricCard
            label="Vol Surge Score"
            value={d.vol_surge_score != null ? Math.round(d.vol_surge_score).toString() : '—'}
            desc="綜合量能爆發分數（0-100）"
            valueColor={vsColor}
            barColor={barColorFor(vsColor)}
            barMin={0} barMax={100} barValue={d.vol_surge_score}
          />
        </div>
      </div>

      {/* ── Group 5: Strategy Fitness ── */}
      <div>
        <GroupHeader zh="策略適性" en="Strategy Fitness" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard
            label="Beta (vs SPY)"
            value={fmtNum(d.beta, 2)}
            desc="板塊對大盤的敏感度，越低代表越獨立強勢"
            valueColor={betaColor}
            barColor={barColorFor(betaColor)}
            barMin={0} barMax={2} barValue={d.beta}
          />
          <MetricCard
            label="Mom Autocorr"
            value={fmtNum(d.momentum_autocorr, 2)}
            desc="週報酬持續性，決定適合何種策略"
            valueColor={autocorrColor}
            barColor={barColorFor(autocorrColor)}
            barMin={-1} barMax={1} barValue={d.momentum_autocorr}
            extra={autocorrLabel}
          />
          <MetricCard
            label="Price Trend R²"
            value={fmtNum(d.price_trend_r2, 2)}
            desc="價格趨勢乾淨程度，越高換倉時機越好掌握"
            valueColor={r2Color}
            barColor={barColorFor(r2Color)}
            barMin={0} barMax={1} barValue={d.price_trend_r2}
          />
        </div>
      </div>

    </div>
  )
}
