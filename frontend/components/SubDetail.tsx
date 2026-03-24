'use client'

import { SubReturn } from '@/lib/types'
import { QuantPanel } from './QuantPanel'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import Link from 'next/link'

interface Props {
  gicsCode: string
  history: SubReturn[]
}

// ── Helpers ──────────────────────────────────────────────────

function fmt(v: number | null, decimals = 1, suffix = '%'): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}${suffix}`
}

function fmtPlain(v: number | null, decimals = 1, suffix = ''): string {
  if (v == null) return '—'
  return `${v.toFixed(decimals)}${suffix}`
}

function retColor(v: number | null) {
  if (v == null) return 'text-gray-500'
  return v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
}

// Derive momentum signal chips from data
function getSignals(d: SubReturn): { label: string; color: string }[] {
  const chips: { label: string; color: string }[] = []
  if (d.mom_score != null) {
    if (d.mom_score >= 80) chips.push({ label: '🔥 Top Momentum', color: 'bg-green-100 text-green-800 border-green-300' })
    else if (d.mom_score >= 65) chips.push({ label: '↑ Strong Momentum', color: 'bg-green-50 text-green-700 border-green-200' })
    else if (d.mom_score <= 20) chips.push({ label: '↓ Weak Momentum', color: 'bg-red-100 text-red-700 border-red-300' })
    else if (d.mom_score <= 35) chips.push({ label: 'Fading Momentum', color: 'bg-orange-100 text-orange-700 border-orange-300' })
  }
  if (d.delta_rank != null) {
    if (d.delta_rank >= 10) chips.push({ label: `▲${d.delta_rank} Rising Fast`, color: 'bg-emerald-100 text-emerald-700 border-emerald-300' })
    else if (d.delta_rank <= -10) chips.push({ label: `▼${Math.abs(d.delta_rank)} Falling Fast`, color: 'bg-red-100 text-red-700 border-red-300' })
  }
  if (d.rvol != null) {
    if (d.rvol >= 1.5) chips.push({ label: `⚡ High Volume ${d.rvol.toFixed(1)}x`, color: 'bg-yellow-100 text-yellow-800 border-yellow-300' })
    else if (d.rvol < 0.7) chips.push({ label: 'Low Volume', color: 'bg-gray-100 text-gray-600 border-gray-300' })
  }
  if (d.pv_divergence === 'confirmed') chips.push({ label: '✓ Volume Confirmed', color: 'bg-blue-100 text-blue-700 border-blue-300' })
  if (d.pv_divergence === 'price_vol_neg') chips.push({ label: '⚠ Volume Divergence', color: 'bg-orange-100 text-orange-700 border-orange-300' })
  if (d.pv_divergence === 'capitulation') chips.push({ label: '↩ Capitulation', color: 'bg-purple-100 text-purple-700 border-purple-300' })
  return chips
}

// Rank cell color for 52-week rank heatmap
function rankCellColor(rank: number | null, total = 155): string {
  if (rank == null) return '#e5e7eb'
  const pct = rank / total
  if (pct <= 0.1) return '#16a34a'
  if (pct <= 0.25) return '#4ade80'
  if (pct <= 0.5) return '#bbf7d0'
  if (pct <= 0.75) return '#fca5a5'
  if (pct <= 0.9) return '#ef4444'
  return '#991b1b'
}

// Custom tooltip for charts
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 shadow-lg text-xs">
      <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}
        </div>
      ))}
    </div>
  )
}

export function SubDetail({ gicsCode, history }: Props) {
  const latest = history[history.length - 1]
  if (!latest) return <div className="p-8 text-center text-gray-400">No data</div>

  const subName = latest.gics_universe?.sub_industry ?? gicsCode
  const sector = latest.gics_universe?.sector ?? '—'

  // ── Chart data ────────────────────────────────────────────
  // Weekly data points (every 5th trading day, plus latest)
  const weeklyHistory = history.filter((_, i) => i % 5 === 0 || i === history.length - 1)

  const rankChartData = weeklyHistory.map((r) => ({
    date: r.date.slice(5), // MM-DD
    rank: r.rank_today,
    score: r.mom_score,
  }))

  const retChartData = weeklyHistory.map((r) => ({
    date: r.date.slice(5),
    ret_3m: r.ret_3m,
    ret_1m: r.ret_1m,
  }))

  const volumeChartData = weeklyHistory.slice(-40).map((r) => ({
    date: r.date.slice(5),
    rvol: r.rvol,
    obv: r.obv_trend,
    vol_mom: r.vol_mom,
  }))

  // ── 52-week rank heatmap ──────────────────────────────────
  // One cell per trading day
  const rankHeatmap = history.slice(-260)

  // ── Percentile from rank ──────────────────────────────────
  const total = 155
  const percentile = latest.rank_today
    ? Math.round((1 - latest.rank_today / total) * 100)
    : null

  const signals = getSignals(latest)

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* ── Breadcrumb ── */}
      <div className="mb-4">
        <Link href="/" className="text-blue-500 hover:underline text-sm">
          ← Back to Heatmap
        </Link>
      </div>

      {/* ── Title ── */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{subName}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {sector} · {gicsCode} · {latest.date}
          {latest.stock_count != null && ` · ${latest.stock_count} stocks`}
        </p>
      </div>

      {/* ── Signal Chips ── */}
      {signals.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {signals.map((s, i) => (
            <span
              key={i}
              className={`text-xs font-medium px-2.5 py-1 rounded-full border ${s.color}`}
            >
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* ── Top Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-6">
        {[
          { label: 'Rank', value: latest.rank_today ? `#${latest.rank_today}` : '—', sub: `top ${percentile ?? '—'}%`, highlight: true },
          { label: 'Mom Score', value: fmtPlain(latest.mom_score), sub: '0–100', highlight: true },
          { label: '1D', value: fmt(latest.ret_1d), colorVal: latest.ret_1d },
          { label: '1W', value: fmt(latest.ret_1w), colorVal: latest.ret_1w },
          { label: '1M', value: fmt(latest.ret_1m), colorVal: latest.ret_1m },
          { label: '3M', value: fmt(latest.ret_3m), colorVal: latest.ret_3m },
          { label: '6M', value: fmt(latest.ret_6m), colorVal: latest.ret_6m },
          { label: 'ΔRank', value: latest.delta_rank != null ? `${latest.delta_rank > 0 ? '▲' : '▼'}${Math.abs(latest.delta_rank)}` : '—', colorVal: latest.delta_rank },
        ].map(({ label, value, sub, highlight, colorVal }) => (
          <div
            key={label}
            className={`rounded-lg p-3 text-center ${
              highlight
                ? 'bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800'
                : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
            <div className={`text-base font-bold mt-0.5 ${colorVal != null ? retColor(colorVal) : 'text-gray-800 dark:text-gray-200'}`}>
              {value}
            </div>
            {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Volume Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {[
          { label: 'RVol', value: latest.rvol != null ? `${latest.rvol.toFixed(2)}x` : '—', desc: 'Relative Volume' },
          { label: 'Vol Mom', value: latest.vol_mom != null ? `${latest.vol_mom.toFixed(2)}x` : '—', desc: 'Volume Momentum' },
          { label: 'OBV Trend', value: latest.obv_trend != null ? (latest.obv_trend >= 0 ? `+${latest.obv_trend.toFixed(4)}` : latest.obv_trend.toFixed(4)) : '—', desc: 'OBV Slope (norm.)' },
          { label: 'PV Signal', value: latest.pv_divergence ?? '—', desc: 'Price-Volume' },
        ].map(({ label, value, desc }) => (
          <div key={label} className="rounded-lg p-3 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800">
            <div className="text-[10px] text-purple-500 uppercase tracking-wide">{label}</div>
            <div className="text-sm font-bold text-purple-800 dark:text-purple-200 mt-0.5">{value}</div>
            <div className="text-[10px] text-purple-400 mt-0.5">{desc}</div>
          </div>
        ))}
      </div>

      {/* ── Rank + Score Charts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
            Weekly Rank History
            <span className="ml-1 font-normal text-gray-400">(lower = stronger)</span>
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={rankChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis reversed domain={[1, total]} tick={{ fontSize: 9 }} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={total / 4} stroke="#4ade80" strokeDasharray="4 4" strokeWidth={1} />
              <ReferenceLine y={total / 2} stroke="#9ca3af" strokeDasharray="4 4" strokeWidth={1} />
              <ReferenceLine y={(total * 3) / 4} stroke="#f87171" strokeDasharray="4 4" strokeWidth={1} />
              <Line type="monotone" dataKey="rank" name="Rank" stroke="#3b82f6" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
            Momentum Score History
          </h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={rankChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={50} stroke="#9ca3af" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="score" name="Mom Score" stroke="#10b981" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 3M / 1M Return Chart ── */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-4">
        <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
          Rolling Return History
        </h2>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={retChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke="#9ca3af" />
            <Line type="monotone" dataKey="ret_3m" name="3M Ret%" stroke="#f59e0b" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="ret_1m" name="1M Ret%" stroke="#8b5cf6" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── OBV + RVol Chart ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
            OBV Trend (norm.)
          </h2>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={volumeChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke="#9ca3af" />
              <Bar dataKey="obv" name="OBV Trend" radius={[2, 2, 0, 0]}>
                {volumeChartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={(entry.obv ?? 0) >= 0 ? '#4ade80' : '#f87171'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
            Relative Volume
          </h2>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={volumeChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} domain={[0, 'auto']} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={1} stroke="#9ca3af" strokeDasharray="4 4" />
              <ReferenceLine y={1.5} stroke="#f59e0b" strokeDasharray="2 2" />
              <Bar dataKey="rvol" name="RVol" radius={[2, 2, 0, 0]}>
                {volumeChartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={(entry.rvol ?? 0) >= 1.5 ? '#f59e0b' : (entry.rvol ?? 0) >= 1 ? '#60a5fa' : '#94a3b8'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 52-week Rank Heatmap ── */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-6">
        <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
          52-Week Daily Rank Heatmap
          <span className="ml-2 font-normal text-gray-400">
            (green=top, red=bottom — {rankHeatmap.length} days)
          </span>
        </h2>
        <div className="flex flex-wrap gap-0.5">
          {rankHeatmap.map((r) => (
            <div
              key={r.date}
              title={`${r.date}: Rank #${r.rank_today ?? '?'}`}
              className="w-2.5 h-4 rounded-sm cursor-default"
              style={{ backgroundColor: rankCellColor(r.rank_today) }}
            />
          ))}
        </div>
        <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
          <span><span className="inline-block w-3 h-3 rounded-sm bg-green-600 mr-1" />Top 10%</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-green-400 mr-1" />Top 25%</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-green-200 mr-1" />Top 50%</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-red-300 mr-1" />Bot 50%</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-red-600 mr-1" />Bot 10%</span>
        </div>
      </div>

      {/* ── Quant Panel ── */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Quantitative Panel
        </h2>
        <QuantPanel data={latest} />
      </div>
    </div>
  )
}
