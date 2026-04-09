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
const BLUE = 'text-emerald-500 dark:text-emerald-400'
const GRAY = 'text-gray-500 dark:text-gray-400'

const BAR_GREEN = 'bg-green-500'
const BAR_YELLOW = 'bg-yellow-400'
const BAR_RED = 'bg-red-400'
const BAR_GRAY = 'bg-gray-400'

function barColorFor(colorClass: string): string {
  if (colorClass.includes('green')) return BAR_GREEN
  if (colorClass.includes('yellow')) return BAR_YELLOW
  if (colorClass.includes('red')) return BAR_RED
  if (colorClass.includes('emerald')) return 'bg-emerald-400'
  return BAR_GRAY
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
    if (d.momentum_autocorr < -0.2) return <span className="mt-1 block text-[10px] text-emerald-500 dark:text-emerald-400">適合均值回歸</span>
    return <span className="mt-1 block text-[10px] text-gray-400">動能不穩定</span>
  })()

  const r2Color = thresholdColor(d.price_trend_r2, [
    { t: 0.85, color: GREEN,  above: true },
    { t: 0.5,  color: YELLOW, above: true },
  ], RED)

  return (
    <div className="space-y-6">

      {/* ── Mom Score Formula Card ── */}
      <div className="rounded-lg p-4 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
        <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-3">
          Mom Score 計算公式
        </div>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-xs font-bold text-emerald-700 dark:text-emerald-300 w-8">50%</span>
            <div>
              <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">報酬動能</div>
              <div className="text-[11px] text-emerald-500 dark:text-emerald-400 font-mono">0.25×Z(1M) + 0.40×Z(3M) + 0.35×Z(6M skip-month)</div>
              <div className="text-[10px] text-emerald-400 dark:text-emerald-500 mt-0.5">短中長期三個時間窗口，6M 採 skip-month 設計避免短期反轉干擾</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-xs font-bold text-emerald-700 dark:text-emerald-300 w-8">25%</span>
            <div>
              <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">動能品質</div>
              <div className="text-[11px] text-emerald-500 dark:text-emerald-400 font-mono">0.50×Z(Price R²) + 0.50×Z(Autocorr 26W)</div>
              <div className="text-[10px] text-emerald-400 dark:text-emerald-500 mt-0.5">趨勢是否乾淨、動能是否持續 — 獎勵直線上漲，懲罰震盪後拉回</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-xs font-bold text-emerald-700 dark:text-emerald-300 w-8">25%</span>
            <div>
              <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">相對強度</div>
              <div className="text-[11px] text-emerald-500 dark:text-emerald-400 font-mono">Z(Information Ratio 26W)</div>
              <div className="text-[10px] text-emerald-400 dark:text-emerald-500 mt-0.5">過去 26 週超額報酬穩定性 — 跑贏大盤且一致的板塊得到加分</div>
            </div>
          </div>
        </div>
        <div className="mt-3 pt-2.5 border-t border-emerald-200 dark:border-emerald-800 text-[10px] text-emerald-400 dark:text-emerald-500">
          Z = 當日截面百分位（0–100），每日重新對所有板塊計算。分數越高代表同期動能最強、趨勢最乾淨、最跑贏大盤。
        </div>
      </div>

      {/* ── Group 1: Momentum Quality ── */}
      <div>
        <GroupHeader zh="動能品質" en="Momentum Quality" />
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="Information Ratio"
            value={fmtNum(d.information_ratio, 2)}
            desc="近 26 週超額報酬穩定性 · 同時進入 Mom Score 相對強度分項"
            valueColor={irColor}
            barColor={barColorFor(irColor)}
            barMin={-1} barMax={2} barValue={d.information_ratio}
          />
          <MetricCard
            label="Momentum Decay"
            value={fmtNum(d.momentum_decay_rate, 1)}
            desc="1M 百分位 − 3M 百分位（當日截面）· 負數是出場預警"
            valueColor={decayColor}
            barColor={barColorFor(decayColor)}
            barMin={-30} barMax={30} barValue={d.momentum_decay_rate}
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
            desc="近 8 週下行波動調整報酬 · 只懲罰下跌，比 Sharpe 更實用"
            valueColor={sortinoColor}
            barColor={barColorFor(sortinoColor)}
            barMin={-2} barMax={5} barValue={d.sortino_8w}
          />
          <MetricCard
            label="Calmar Ratio"
            value={fmtNum(d.calmar_ratio, 2)}
            desc="近 52 週年化報酬 ÷ 最大回撤（峰谷法）· Calmar Ratio"
            valueColor={calmarColor}
            barColor={barColorFor(calmarColor)}
            barMin={-2} barMax={6} barValue={d.calmar_ratio}
          />
          <MetricCard
            label="Volatility (ann.)"
            value={d.volatility_8w != null ? `${d.volatility_8w.toFixed(1)}%` : '—'}
            desc="近 8 週週報酬標準差年化 · 低波動更適合趨勢策略"
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
            desc="近 20 日：近 5 日均報酬 > 近 20 日均報酬的股票比例"
            valueColor={llColor}
            barColor={barColorFor(llColor)}
            barMin={0} barMax={5} barValue={d.leader_lagger_ratio}
          />
          <MetricCard
            label="Downside Capture"
            value={fmtNum(d.downside_capture, 2)}
            desc="全年 ~84 週：SPY 下跌週，板塊平均跟跌幅度比"
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
            desc="近 20 日 Chaikin Money Flow · -1 到 +1，資金淨流入方向"
            valueColor={cmfColor}
            barColor={barColorFor(cmfColor)}
            barMin={-1} barMax={1} barValue={d.cmf}
          />
          <MetricCard
            label="RVol"
            value={d.rvol != null ? `${d.rvol.toFixed(2)}x` : '—'}
            desc="今日成交量 ÷ 過去 20 日均量 · 反映當前量能異常程度"
            valueColor={rvolColor}
            barColor={barColorFor(rvolColor)}
            barMin={0} barMax={3} barValue={d.rvol}
          />
          <MetricCard
            label="Vol Surge Score"
            value={d.vol_surge_score != null ? Math.round(d.vol_surge_score).toString() : '—'}
            desc="近 8 週量能爆發綜合分數 · 連續高量、峰值、高量佔比合成"
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
            desc="全年 ~84 週 vs SPY · 越低代表板塊越獨立於大盤"
            valueColor={betaColor}
            barColor={barColorFor(betaColor)}
            barMin={0} barMax={2} barValue={d.beta}
          />
          <MetricCard
            label="Mom Autocorr"
            value={fmtNum(d.momentum_autocorr, 2)}
            desc="近 26 週週報酬 lag-1 自相關 · 同時進入 Mom Score 動能品質分項"
            valueColor={autocorrColor}
            barColor={barColorFor(autocorrColor)}
            barMin={-1} barMax={1} barValue={d.momentum_autocorr}
            extra={autocorrLabel}
          />
          <MetricCard
            label="Price Trend R²"
            value={fmtNum(d.price_trend_r2, 2)}
            desc="近 63 日（3M）價格對時間線性 R² · 越高趨勢越乾淨"
            valueColor={r2Color}
            barColor={barColorFor(r2Color)}
            barMin={0} barMax={1} barValue={d.price_trend_r2}
          />
        </div>
      </div>

      {/* ── Group 6: MA Regime & Breadth ── */}
      <div>
        <GroupHeader zh="均線與廣度" en="MA Regime & Breadth" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricCard
            label="vs MA5"
            value={d.price_vs_ma5 != null ? `${d.price_vs_ma5 >= 0 ? '+' : ''}${d.price_vs_ma5.toFixed(2)}%` : '—'}
            desc="等權指數 vs 5日均線 · 正=在均線上方"
            valueColor={d.price_vs_ma5 != null ? (d.price_vs_ma5 >= 0 ? GREEN : RED) : GRAY}
            barColor={d.price_vs_ma5 != null ? (d.price_vs_ma5 >= 0 ? BAR_GREEN : BAR_RED) : BAR_GRAY}
            barMin={-10} barMax={10} barValue={d.price_vs_ma5}
          />
          <MetricCard
            label="vs MA20"
            value={d.price_vs_ma20 != null ? `${d.price_vs_ma20 >= 0 ? '+' : ''}${d.price_vs_ma20.toFixed(2)}%` : '—'}
            desc="等權指數 vs 20日均線 · 正=上升趨勢確立"
            valueColor={d.price_vs_ma20 != null ? (d.price_vs_ma20 >= 0 ? GREEN : RED) : GRAY}
            barColor={d.price_vs_ma20 != null ? (d.price_vs_ma20 >= 0 ? BAR_GREEN : BAR_RED) : BAR_GRAY}
            barMin={-15} barMax={15} barValue={d.price_vs_ma20}
          />
          <MetricCard
            label="vs MA100"
            value={d.price_vs_ma100 != null ? `${d.price_vs_ma100 >= 0 ? '+' : ''}${d.price_vs_ma100.toFixed(2)}%` : '—'}
            desc="等權指數 vs 100日均線 · 中期趨勢判斷"
            valueColor={d.price_vs_ma100 != null ? (d.price_vs_ma100 >= 0 ? GREEN : RED) : GRAY}
            barColor={d.price_vs_ma100 != null ? (d.price_vs_ma100 >= 0 ? BAR_GREEN : BAR_RED) : BAR_GRAY}
            barMin={-20} barMax={20} barValue={d.price_vs_ma100}
          />
          <MetricCard
            label="vs MA200"
            value={d.price_vs_ma200 != null ? `${d.price_vs_ma200 >= 0 ? '+' : ''}${d.price_vs_ma200.toFixed(2)}%` : '—'}
            desc="等權指數 vs 200日均線 · 長期多空判斷"
            valueColor={d.price_vs_ma200 != null ? (d.price_vs_ma200 >= 0 ? GREEN : RED) : GRAY}
            barColor={d.price_vs_ma200 != null ? (d.price_vs_ma200 >= 0 ? BAR_GREEN : BAR_RED) : BAR_GRAY}
            barMin={-25} barMax={25} barValue={d.price_vs_ma200}
          />
          <MetricCard
            label="Breadth 20MA"
            value={d.breadth_20ma != null ? `${d.breadth_20ma.toFixed(1)}%` : '—'}
            desc="個股站上 20日均線比例 · > 70% 廣泛強勢，< 30% 廣泛走弱"
            valueColor={d.breadth_20ma != null ? (d.breadth_20ma >= 70 ? GREEN : d.breadth_20ma >= 40 ? YELLOW : RED) : GRAY}
            barColor={d.breadth_20ma != null ? (d.breadth_20ma >= 70 ? BAR_GREEN : d.breadth_20ma >= 40 ? BAR_YELLOW : BAR_RED) : BAR_GRAY}
            barMin={0} barMax={100} barValue={d.breadth_20ma}
          />
          <MetricCard
            label="Breadth 50MA"
            value={d.breadth_50ma != null ? `${d.breadth_50ma.toFixed(1)}%` : '—'}
            desc="個股站上 50日均線比例 · 中期廣度，趨勢持續性指標"
            valueColor={d.breadth_50ma != null ? (d.breadth_50ma >= 70 ? GREEN : d.breadth_50ma >= 40 ? YELLOW : RED) : GRAY}
            barColor={d.breadth_50ma != null ? (d.breadth_50ma >= 70 ? BAR_GREEN : d.breadth_50ma >= 40 ? BAR_YELLOW : BAR_RED) : BAR_GRAY}
            barMin={0} barMax={100} barValue={d.breadth_50ma}
          />
          <MetricCard
            label="52W High Prox"
            value={d.high_proximity != null ? `${(d.high_proximity * 100).toFixed(1)}%` : '—'}
            desc="等權指數 / 52週高點 · > 95% 接近突破，= 100% 創新高"
            valueColor={d.high_proximity != null ? (d.high_proximity >= 0.95 ? GREEN : d.high_proximity >= 0.80 ? YELLOW : RED) : GRAY}
            barColor={d.high_proximity != null ? (d.high_proximity >= 0.95 ? BAR_GREEN : d.high_proximity >= 0.80 ? BAR_YELLOW : BAR_RED) : BAR_GRAY}
            barMin={50} barMax={105} barValue={d.high_proximity != null ? d.high_proximity * 100 : null}
          />
        </div>
      </div>

    </div>
  )
}
