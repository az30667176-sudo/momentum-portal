'use client'

import { useEffect, useState } from 'react'
import { SubReturn, StockReturn } from '@/lib/types'
import { QuantPanel } from './QuantPanel'
import { InteractiveChart } from './InteractiveChart'
import Link from 'next/link'

// ─── Types ───────────────────────────────────────────────────

interface Props {
  gicsCode: string
  history: SubReturn[]
  stocks: StockReturn[]
}

// ─── Card config ─────────────────────────────────────────────

interface CardConfig {
  label: string
  value: (d: SubReturn) => string
  color: (d: SubReturn) => string
  desc: string
}

const CARD_CONFIGS: Record<string, CardConfig> = {
  information_ratio: {
    label: 'Info Ratio',
    value: d => d.information_ratio != null ? d.information_ratio.toFixed(2) : '—',
    color: d => d.information_ratio != null ? (d.information_ratio > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '超額報酬穩定性 · 全年',
  },
  momentum_decay_rate: {
    label: 'Decay Rate',
    value: d => d.momentum_decay_rate != null ? d.momentum_decay_rate.toFixed(1) : '—',
    color: d => d.momentum_decay_rate != null ? (d.momentum_decay_rate < 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400') : 'text-gray-400',
    desc: '1M%位 − 3M%位 · 負=預警',
  },
  sortino_8w: {
    label: 'Sortino',
    value: d => d.sortino_8w != null ? d.sortino_8w.toFixed(2) : '—',
    color: d => d.sortino_8w != null ? (d.sortino_8w > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '下行風險調整 · 近8週',
  },
  calmar_ratio: {
    label: 'Calmar',
    value: d => d.calmar_ratio != null ? d.calmar_ratio.toFixed(2) : '—',
    color: d => d.calmar_ratio != null ? (d.calmar_ratio > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '近 52 週年化報酬 ÷ 最大回撤（峰谷法）',
  },
  volatility_8w: {
    label: 'Volatility',
    value: d => d.volatility_8w != null ? `${d.volatility_8w.toFixed(1)}%` : '—',
    color: () => 'text-gray-700 dark:text-gray-300',
    desc: '週報酬標準差年化 · 近8週',
  },
  leader_lagger_ratio: {
    label: 'Lead/Lag',
    value: d => d.leader_lagger_ratio != null ? `${(d.leader_lagger_ratio * 100).toFixed(0)}%` : '—',
    color: d => d.leader_lagger_ratio != null ? (d.leader_lagger_ratio > 0.5 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '領先股比例 · 近20日',
  },
  downside_capture: {
    label: 'DS Capture',
    value: d => d.downside_capture != null ? `${d.downside_capture.toFixed(1)}%` : '—',
    color: d => d.downside_capture != null ? (d.downside_capture < 100 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: 'SPY下跌週跟跌幅 · 全年',
  },
  cmf: {
    label: 'CMF',
    value: d => d.cmf != null ? d.cmf.toFixed(3) : '—',
    color: d => d.cmf != null ? (d.cmf > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: 'Chaikin Money Flow · 近20日',
  },
  rvol: {
    label: 'RVol',
    value: d => d.rvol != null ? `${d.rvol.toFixed(2)}x` : '—',
    color: d => d.rvol != null ? (d.rvol >= 1.5 ? 'text-yellow-600 dark:text-yellow-400' : d.rvol < 0.7 ? 'text-gray-400' : 'text-gray-700 dark:text-gray-300') : 'text-gray-400',
    desc: '今日量 ÷ 20日均量',
  },
  vol_surge_score: {
    label: 'Vol Surge',
    value: d => d.vol_surge_score != null ? d.vol_surge_score.toFixed(2) : '—',
    color: d => d.vol_surge_score != null ? (d.vol_surge_score > 0.5 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-700 dark:text-gray-300') : 'text-gray-400',
    desc: '量能爆發分數 · 近8週',
  },
  obv_trend: {
    label: 'OBV Trend',
    value: d => d.obv_trend != null ? (d.obv_trend >= 0 ? `+${d.obv_trend.toFixed(4)}` : d.obv_trend.toFixed(4)) : '—',
    color: d => d.obv_trend != null ? (d.obv_trend >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: 'OBV斜率標準化',
  },
  vol_mom: {
    label: 'Vol Mom',
    value: d => d.vol_mom != null ? `${d.vol_mom.toFixed(2)}x` : '—',
    color: d => d.vol_mom != null ? (d.vol_mom > 1 ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300') : 'text-gray-400',
    desc: '成交量動能 · 近/前期比',
  },
  price_vs_ma5: {
    label: 'vs MA5',
    value: d => d.price_vs_ma5 != null ? `${d.price_vs_ma5 >= 0 ? '+' : ''}${d.price_vs_ma5.toFixed(2)}%` : '—',
    color: d => d.price_vs_ma5 != null ? (d.price_vs_ma5 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '指數 vs 5日均線偏離%',
  },
  price_vs_ma20: {
    label: 'vs MA20',
    value: d => d.price_vs_ma20 != null ? `${d.price_vs_ma20 >= 0 ? '+' : ''}${d.price_vs_ma20.toFixed(2)}%` : '—',
    color: d => d.price_vs_ma20 != null ? (d.price_vs_ma20 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '指數 vs 20日均線偏離%',
  },
  price_vs_ma100: {
    label: 'vs MA100',
    value: d => d.price_vs_ma100 != null ? `${d.price_vs_ma100 >= 0 ? '+' : ''}${d.price_vs_ma100.toFixed(2)}%` : '—',
    color: d => d.price_vs_ma100 != null ? (d.price_vs_ma100 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '指數 vs 100日均線偏離%',
  },
  price_vs_ma200: {
    label: 'vs MA200',
    value: d => d.price_vs_ma200 != null ? `${d.price_vs_ma200 >= 0 ? '+' : ''}${d.price_vs_ma200.toFixed(2)}%` : '—',
    color: d => d.price_vs_ma200 != null ? (d.price_vs_ma200 >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '指數 vs 200日均線偏離%',
  },
  breadth_20ma: {
    label: 'B. 20MA',
    value: d => d.breadth_20ma != null ? `${d.breadth_20ma.toFixed(1)}%` : '—',
    color: d => d.breadth_20ma != null ? (d.breadth_20ma >= 70 ? 'text-green-600 dark:text-green-400' : d.breadth_20ma >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '個股站上20日均線比例',
  },
  breadth_50ma: {
    label: 'B. 50MA',
    value: d => d.breadth_50ma != null ? `${d.breadth_50ma.toFixed(1)}%` : '—',
    color: d => d.breadth_50ma != null ? (d.breadth_50ma >= 70 ? 'text-green-600 dark:text-green-400' : d.breadth_50ma >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '個股站上50日均線比例',
  },
  high_proximity: {
    label: '52W High',
    value: d => d.high_proximity != null ? `${(d.high_proximity * 100).toFixed(1)}%` : '—',
    color: d => d.high_proximity != null ? (d.high_proximity >= 0.95 ? 'text-green-600 dark:text-green-400' : d.high_proximity >= 0.80 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '距52週高點比例',
  },
  beta: {
    label: 'Beta',
    value: d => d.beta != null ? d.beta.toFixed(2) : '—',
    color: d => d.beta != null ? (d.beta < 1 ? 'text-green-600 dark:text-green-400' : d.beta > 1.3 ? 'text-red-500 dark:text-red-400' : 'text-gray-700 dark:text-gray-300') : 'text-gray-400',
    desc: 'vs SPY · 全年~84週',
  },
  momentum_autocorr: {
    label: 'Autocorr',
    value: d => d.momentum_autocorr != null ? d.momentum_autocorr.toFixed(3) : '—',
    color: d => d.momentum_autocorr != null ? (d.momentum_autocorr > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400') : 'text-gray-400',
    desc: '週報酬自相關 · 正=趨勢持續',
  },
  price_trend_r2: {
    label: 'Trend R²',
    value: d => d.price_trend_r2 != null ? d.price_trend_r2.toFixed(3) : '—',
    color: () => 'text-gray-700 dark:text-gray-300',
    desc: '近63日價格線性R²',
  },
}

const INDICATOR_GROUPS: { label: string; keys: string[] }[] = [
  { label: '動能品質',   keys: ['information_ratio', 'momentum_decay_rate'] },
  { label: '風險調整',   keys: ['sortino_8w', 'calmar_ratio', 'volatility_8w'] },
  { label: '板塊結構',   keys: ['leader_lagger_ratio', 'downside_capture'] },
  { label: '資金流動',   keys: ['cmf', 'rvol', 'vol_surge_score', 'obv_trend', 'vol_mom'] },
  { label: '策略適性',   keys: ['beta', 'momentum_autocorr', 'price_trend_r2'] },
  { label: '均線與廣度', keys: ['price_vs_ma5', 'price_vs_ma20', 'price_vs_ma100', 'price_vs_ma200', 'breadth_20ma', 'breadth_50ma', 'high_proximity'] },
]

const DEFAULT_CARDS = ['rvol', 'obv_trend', 'cmf', 'momentum_decay_rate']
const LS_KEY = 'momentum-portal-custom-cards'

// ─── Helpers ─────────────────────────────────────────────────

function fmt(v: number | null, decimals = 1, suffix = '%'): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}${suffix}`
}

function retColor(v: number | null) {
  if (v == null) return 'text-gray-500'
  return v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
}

function getSignals(d: SubReturn): { label: string; color: string }[] {
  const chips: { label: string; color: string }[] = []
  if (d.mom_score != null) {
    if      (d.mom_score >= 80) chips.push({ label: '🔥 Top Momentum',    color: 'bg-green-100 text-green-800 border-green-300' })
    else if (d.mom_score >= 65) chips.push({ label: '↑ Strong Momentum',  color: 'bg-green-50 text-green-700 border-green-200' })
    else if (d.mom_score <= 20) chips.push({ label: '↓ Weak Momentum',    color: 'bg-red-100 text-red-700 border-red-300' })
    else if (d.mom_score <= 35) chips.push({ label: 'Fading Momentum',    color: 'bg-orange-100 text-orange-700 border-orange-300' })
  }
  if (d.delta_rank != null) {
    if      (d.delta_rank >= 10)  chips.push({ label: `▲${d.delta_rank} Rising Fast`,          color: 'bg-emerald-100 text-emerald-700 border-emerald-300' })
    else if (d.delta_rank <= -10) chips.push({ label: `▼${Math.abs(d.delta_rank)} Falling Fast`, color: 'bg-red-100 text-red-700 border-red-300' })
  }
  if (d.rvol != null) {
    if      (d.rvol >= 1.5) chips.push({ label: `⚡ High Volume ${d.rvol.toFixed(1)}x`, color: 'bg-yellow-100 text-yellow-800 border-yellow-300' })
    else if (d.rvol < 0.7)  chips.push({ label: 'Low Volume',                           color: 'bg-gray-100 text-gray-600 border-gray-300' })
  }
  return chips
}

function rankCellColor(rank: number | null, total = 155): string {
  if (rank == null) return '#e5e7eb'
  const pct = rank / total
  if (pct <= 0.1)  return '#16a34a'
  if (pct <= 0.25) return '#4ade80'
  if (pct <= 0.5)  return '#bbf7d0'
  if (pct <= 0.75) return '#fca5a5'
  if (pct <= 0.9)  return '#ef4444'
  return '#991b1b'
}

// ─── Customize Modal ─────────────────────────────────────────

function CustomizeModal({
  selected,
  onToggle,
  onClose,
}: {
  selected: string[]
  onToggle: (key: string) => void
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-800 flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">自訂指標卡片</h3>
            <p className="text-xs text-gray-400 mt-0.5">最多選 4 個 · 已選 {selected.length}/4</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {INDICATOR_GROUPS.map(group => (
            <div key={group.label}>
              <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                {group.label}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {group.keys.map(key => {
                  const cfg = CARD_CONFIGS[key]
                  if (!cfg) return null
                  const isOn  = selected.includes(key)
                  const isOff = !isOn && selected.length >= 4
                  return (
                    <button
                      key={key}
                      disabled={isOff}
                      onClick={() => onToggle(key)}
                      className={`text-left text-xs rounded-lg px-3 py-2 border transition-colors ${
                        isOn
                          ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                          : isOff
                          ? 'border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
                          : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="font-medium flex items-center gap-1">
                        {isOn && <span className="text-emerald-500 text-[10px]">✓</span>}
                        {cfg.label}
                      </div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                        {cfg.desc}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

export function SubDetail({ gicsCode, history, stocks }: Props) {
  const latest = history[history.length - 1]
  if (!latest) return <div className="p-8 text-center text-gray-400">No data</div>

  const subName   = latest.gics_universe?.sub_industry ?? gicsCode
  const sector    = latest.gics_universe?.sector ?? '—'
  const total     = 155
  const percentile = latest.rank_today ? Math.round((1 - latest.rank_today / total) * 100) : null
  const signals   = getSignals(latest)
  const rankHeatmap = history.slice(-260)

  // ── Custom cards state ───────────────────────────────────
  const [selectedCards, setSelectedCards] = useState<string[]>(DEFAULT_CARDS)
  const [hydrated, setHydrated]           = useState(false)
  const [showModal, setShowModal]         = useState(false)

  // Read from localStorage after mount
  useEffect(() => {
    setHydrated(true)
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 4) {
          setSelectedCards(parsed)
        }
      }
    } catch {}
  }, [])

  // Write to localStorage when selection changes
  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem(LS_KEY, JSON.stringify(selectedCards)) } catch {}
  }, [selectedCards, hydrated])

  const toggleCard = (key: string) => {
    setSelectedCards(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : prev.length < 4 ? [...prev, key] : prev
    )
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">

      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/sectors" className="text-emerald-500 hover:underline text-sm">
          ← 返回產業總覽
        </Link>
      </div>

      {/* Title */}
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{subName}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {sector} ·{' '}
            <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              {gicsCode}
            </span>
            {' '}· {latest.date}
            {latest.stock_count != null && ` · ${latest.stock_count} stocks`}
          </p>
        </div>
      </div>

      {/* Signal chips */}
      {signals.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {signals.map((s, i) => (
            <span key={i} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${s.color}`}>
              {s.label}
            </span>
          ))}
        </div>
      )}

      {/* Top stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
        {[
          { label: 'Rank',      value: latest.rank_today ? `#${latest.rank_today}` : '—', sub: `top ${percentile ?? '—'}%`, highlight: true },
          { label: 'Mom Score', value: latest.mom_score != null ? latest.mom_score.toFixed(1) : '—', sub: '0–100', highlight: true },
          { label: '1D',  value: fmt(latest.ret_1d),  colorVal: latest.ret_1d },
          { label: '1W',  value: fmt(latest.ret_1w),  colorVal: latest.ret_1w },
          { label: '1M',  value: fmt(latest.ret_1m),  colorVal: latest.ret_1m },
          { label: '3M',  value: fmt(latest.ret_3m),  colorVal: latest.ret_3m },
          { label: '6M',  value: fmt(latest.ret_6m),  colorVal: latest.ret_6m },
          { label: 'ΔRank', value: latest.delta_rank != null ? `${latest.delta_rank > 0 ? '▲' : '▼'}${Math.abs(latest.delta_rank)}` : '—', colorVal: latest.delta_rank },
        ].map(({ label, value, sub, highlight, colorVal }) => (
          <div
            key={label}
            className={`rounded-lg p-3 text-center ${
              highlight
                ? 'bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800'
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

      {/* ── Customizable 4 cards ────────────────────────────── */}
      <div className="relative mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {selectedCards.map(key => {
            const cfg = CARD_CONFIGS[key]
            if (!cfg) return null
            return (
              <div key={key} className="rounded-lg p-3 bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800">
                <div className="text-[10px] text-purple-500 uppercase tracking-wide">{cfg.label}</div>
                <div className={`text-sm font-bold mt-0.5 ${cfg.color(latest)}`}>
                  {cfg.value(latest)}
                </div>
                <div className="text-[10px] text-purple-400 mt-0.5 truncate">{cfg.desc}</div>
              </div>
            )
          })}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="absolute -top-0.5 right-0 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition-colors"
        >
          自訂 ⚙
        </button>
      </div>

      {showModal && (
        <CustomizeModal selected={selectedCards} onToggle={toggleCard} onClose={() => setShowModal(false)} />
      )}

      {/* ── Interactive Chart ────────────────────────────────── */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
          Price Index · {subName}
        </h2>
        <InteractiveChart history={history} />
      </div>

      {/* ── 52-week Rank Heatmap ─────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-6">
        <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3">
          52-Week Daily Rank Heatmap
          <span className="ml-2 font-normal text-gray-400">
            (green=top, red=bottom — {rankHeatmap.length} days)
          </span>
        </h2>
        <div className="flex flex-wrap gap-0.5">
          {rankHeatmap.map(r => (
            <div
              key={r.date}
              title={`${r.date}: Rank #${r.rank_today ?? '?'}`}
              className="w-2.5 h-4 rounded-sm cursor-default"
              style={{ backgroundColor: rankCellColor(r.rank_today) }}
            />
          ))}
        </div>
        <div className="flex gap-3 mt-2 text-[10px] text-gray-400 flex-wrap">
          <span><span className="inline-block w-3 h-3 rounded-sm bg-green-600 mr-1" />Top 10%</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-green-400 mr-1" />Top 25%</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-green-200 mr-1" />Top 50%</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-red-300 mr-1"  />Bot 50%</span>
          <span><span className="inline-block w-3 h-3 rounded-sm bg-red-600 mr-1"  />Bot 10%</span>
        </div>
      </div>

      {/* ── Individual Stocks ────────────────────────────────── */}
      {stocks.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 mb-4 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Individual Stocks
              <span className="ml-2 font-normal text-gray-400">({stocks.length} stocks · {latest.date})</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                  <th className="text-left px-4 py-2 font-medium w-8">#</th>
                  <th className="text-left px-4 py-2 font-medium">Ticker</th>
                  <th className="text-right px-3 py-2 font-medium">1D</th>
                  <th className="text-right px-3 py-2 font-medium">1W</th>
                  <th className="text-right px-3 py-2 font-medium">1M</th>
                  <th className="text-right px-3 py-2 font-medium">3M</th>
                  <th className="text-right px-3 py-2 font-medium">RVol</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {[...stocks]
                  .sort((a, b) => (a.rank_in_sub ?? 999) - (b.rank_in_sub ?? 999))
                  .map(s => (
                    <tr key={s.ticker} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-4 py-2 text-gray-400">{s.rank_in_sub ?? '—'}</td>
                      <td className="px-4 py-2 font-bold">
                        <Link href={`/stock/${s.ticker}`} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                          {s.ticker}
                        </Link>
                      </td>
                      {[s.ret_1d, s.ret_1w, s.ret_1m, s.ret_3m].map((v, i) => (
                        <td key={i} className={`px-3 py-2 text-right font-medium ${v == null ? 'text-gray-400' : v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                          {v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '—'}
                        </td>
                      ))}
                      <td className={`px-3 py-2 text-right ${s.rvol == null ? 'text-gray-400' : s.rvol >= 1.5 ? 'text-yellow-600 dark:text-yellow-400 font-semibold' : 'text-gray-600 dark:text-gray-400'}`}>
                        {s.rvol != null ? `${s.rvol.toFixed(2)}x` : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Quant Panel ─────────────────────────────────────── */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          Quantitative Panel
        </h2>
        <QuantPanel data={latest} />
      </div>

    </div>
  )
}
