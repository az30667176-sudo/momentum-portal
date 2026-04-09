'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { StockReturn, StockInfo, SubReturn } from '@/lib/types'

// ─── Types ───────────────────────────────────────────────────

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'
type SubKey = 'rank_in_sub' | 'mom_score' | 'rvol' | 'obv_trend' | 'ret_1d'
interface MAConfig { period: number; color: string; id: number }

interface Props {
  info:      StockInfo
  history:   StockReturn[]
  subReturn: SubReturn | null
}

// ─── Constants ───────────────────────────────────────────────

const MA_PALETTE = [
  '#f97316', '#3b82f6', '#22c55e', '#a855f7',
  '#ec4899', '#14b8a6', '#f59e0b', '#ef4444',
]

const RANGES: TimeRange[] = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL']

const STOCK_SUB_OPTIONS: { key: SubKey; label: string }[] = [
  { key: 'rank_in_sub', label: 'Sub Rank' },
  { key: 'mom_score',   label: 'Mom Score' },
  { key: 'rvol',        label: 'RVol' },
  { key: 'obv_trend',   label: 'OBV Trend' },
  { key: 'ret_1d',      label: '1D Return' },
]

// ─── Helpers ─────────────────────────────────────────────────

function fmt(v: number | null, decimals = 1, suffix = '%'): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(decimals)}${suffix}`
}

function retColor(v: number | null) {
  if (v == null) return 'text-gray-500'
  return v >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
}

function buildOHLC(history: StockReturn[]) {
  let idx = 100
  return history.map(r => {
    const prev = idx
    idx = prev * (1 + (r.ret_1d || 0) / 100)
    const noise = Math.abs(r.ret_1d || 0) * 0.15
    return {
      time:  r.date,
      open:  prev,
      close: idx,
      high:  Math.max(prev, idx) * (1 + noise / 100),
      low:   Math.min(prev, idx) * (1 - noise / 100),
    }
  })
}

function calcMA(closes: { time: string; value: number }[], period: number) {
  const out: { time: string; value: number }[] = []
  for (let i = period - 1; i < closes.length; i++) {
    const avg = closes.slice(i - period + 1, i + 1).reduce((s, c) => s + c.value, 0) / period
    out.push({ time: closes[i].time, value: avg })
  }
  return out
}

function rangeFrom(range: TimeRange, latest: string): string {
  const d = new Date(latest)
  if      (range === '1M')  d.setMonth(d.getMonth() - 1)
  else if (range === '3M')  d.setMonth(d.getMonth() - 3)
  else if (range === '6M')  d.setMonth(d.getMonth() - 6)
  else if (range === 'YTD') { d.setMonth(0); d.setDate(1) }
  else if (range === '1Y')  d.setFullYear(d.getFullYear() - 1)
  else return '2000-01-01'
  return d.toISOString().slice(0, 10)
}

function getStockSubData(history: StockReturn[], key: SubKey, maxRank: number) {
  switch (key) {
    case 'rank_in_sub':
      return history
        .filter(r => r.rank_in_sub != null)
        .map(r => ({ time: r.date, value: maxRank + 1 - (r.rank_in_sub as number) }))
    case 'mom_score':
      return history
        .filter(r => r.mom_score != null)
        .map(r => ({ time: r.date, value: r.mom_score as number }))
    case 'rvol':
      return history
        .filter(r => r.rvol != null)
        .map(r => ({
          time:  r.date,
          value: r.rvol as number,
          color: (r.rvol as number) >= 1.5 ? '#f97316' : '#60a5fa',
        }))
    case 'obv_trend':
      return history
        .filter(r => r.obv_trend != null)
        .map(r => ({
          time:  r.date,
          value: r.obv_trend as number,
          color: (r.obv_trend as number) >= 0 ? '#22c55e' : '#ef4444',
        }))
    case 'ret_1d':
      return history
        .filter(r => r.ret_1d != null)
        .map(r => ({
          time:  r.date,
          value: r.ret_1d as number,
          color: (r.ret_1d as number) >= 0 ? '#22c55e66' : '#ef444466',
        }))
    default:
      return []
  }
}

function isStockLine(key: SubKey) {
  return key === 'rank_in_sub' || key === 'mom_score'
}

function stockSubLineColor(key: SubKey) {
  if (key === 'rank_in_sub') return '#3b82f6'
  if (key === 'mom_score')   return '#10b981'
  return '#3b82f6'
}

// ─── StockChart ───────────────────────────────────────────────

function StockChart({ history }: { history: StockReturn[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mainRef      = useRef<HTMLDivElement>(null)
  const sub1Ref      = useRef<HTMLDivElement>(null)
  const sub2Ref      = useRef<HTMLDivElement>(null)
  const sub3Ref      = useRef<HTMLDivElement>(null)

  const chartsRef    = useRef<any[]>([])
  const primaryRef   = useRef<(any | null)[]>([null, null, null, null])
  const maSeriesRef  = useRef<Map<number, any>>(new Map())
  const subSeriesRef = useRef<(any | null)[]>([null, null, null])

  const [chartsReady, setChartsReady] = useState(false)
  const [maConfigs, setMaConfigs] = useState<MAConfig[]>([
    { period: 5,  color: MA_PALETTE[0], id: 0 },
    { period: 10, color: MA_PALETTE[1], id: 1 },
    { period: 20, color: MA_PALETTE[2], id: 2 },
  ])
  const [subKeys, setSubKeys]     = useState<SubKey[]>(['rank_in_sub', 'mom_score', 'rvol'])
  const [activeRange, setActive]  = useState<TimeRange>('1Y')
  const [showMaPanel, setMaPanel] = useState(false)
  const [newPeriod, setNewPeriod] = useState('')
  const [nextId, setNextId]       = useState(3)

  const maxRank    = useRef(Math.max(...history.map(r => r.rank_in_sub ?? 0), 10))
  const ohlcData   = useRef(buildOHLC(history))
  const closeData  = useRef(ohlcData.current.map(d => ({ time: d.time, value: d.close })))
  const latestDate = history[history.length - 1]?.date ?? ''

  // ── Mount: create chart instances ──────────────────────────
  useEffect(() => {
    if (!mainRef.current || !sub1Ref.current || !sub2Ref.current
      || !sub3Ref.current || !history.length) return

    let alive = true

    import('lightweight-charts').then(({ createChart }) => {
      if (!alive) return

      const base = {
        layout:    { background: { color: '#ffffff' }, textColor: '#6b7280', fontSize: 11 },
        grid:      { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: '#e5e7eb' },
        timeScale:       { borderColor: '#e5e7eb', timeVisible: false },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale:  { mouseWheel: true },
      }

      const mainChart = createChart(mainRef.current!, { ...base, height: 300 })
      const s1Chart   = createChart(sub1Ref.current!, { ...base, height: 120 })
      const s2Chart   = createChart(sub2Ref.current!, { ...base, height: 120 })
      const s3Chart   = createChart(sub3Ref.current!, { ...base, height: 120 })
      const all = [mainChart, s1Chart, s2Chart, s3Chart]
      chartsRef.current = all

      const candle = mainChart.addCandlestickSeries({
        upColor:       '#22c55e', downColor:       '#ef4444',
        borderUpColor: '#16a34a', borderDownColor: '#dc2626',
        wickUpColor:   '#16a34a', wickDownColor:   '#dc2626',
      })
      candle.setData(ohlcData.current as any)
      primaryRef.current[0] = candle

      // Sync time scale
      let syncing = false
      all.forEach((chart, i) => {
        chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
          if (syncing || !range) return
          syncing = true
          all.forEach((c, j) => { if (j !== i) c.timeScale().setVisibleLogicalRange(range) })
          syncing = false
        })
      })

      // Sync crosshair
      all.forEach((src, si) => {
        src.subscribeCrosshairMove((param: any) => {
          all.forEach((dst, di) => {
            if (di === si) return
            const s = primaryRef.current[di]
            if (!s) return
            try {
              if (param.time) dst.setCrosshairPosition(NaN, param.time, s)
              else            dst.clearCrosshairPosition()
            } catch {}
          })
        })
      })

      // Resize observer
      const ro = new ResizeObserver(() => {
        const w = containerRef.current?.clientWidth ?? 900
        all.forEach(c => { try { c.applyOptions({ width: w }) } catch {} })
      })
      if (containerRef.current) ro.observe(containerRef.current)
      ;(chartsRef as any)._ro = ro

      // Initial range
      if (latestDate) {
        const from = rangeFrom('1Y', latestDate)
        all.forEach(c => {
          try { c.timeScale().setVisibleRange({ from, to: latestDate } as any) } catch {}
        })
      }

      setChartsReady(true)
    })

    return () => {
      alive = false
      ;(chartsRef as any)._ro?.disconnect()
      chartsRef.current.forEach(c => { try { c.remove() } catch {} })
      chartsRef.current    = []
      maSeriesRef.current.clear()
      subSeriesRef.current = [null, null, null]
      primaryRef.current   = [null, null, null, null]
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rebuild MA series ────────────────────────────────────
  useEffect(() => {
    const mainChart = chartsRef.current[0]
    if (!chartsReady || !mainChart) return
    maSeriesRef.current.forEach(s => { try { mainChart.removeSeries(s) } catch {} })
    maSeriesRef.current.clear()
    maConfigs.forEach(({ period, color, id }) => {
      try {
        const s = mainChart.addLineSeries({
          color, lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false, crossHairMarkerVisible: false,
        })
        s.setData(calcMA(closeData.current, period) as any)
        maSeriesRef.current.set(id, s)
      } catch {}
    })
  }, [chartsReady, maConfigs])

  // ── Rebuild sub-indicator series ────────────────────────
  useEffect(() => {
    const subCharts = chartsRef.current.slice(1)
    if (!chartsReady || subCharts.length < 3) return

    subKeys.forEach((key, i) => {
      const chart = subCharts[i]
      if (!chart) return

      const old = subSeriesRef.current[i]
      if (old) { try { chart.removeSeries(old) } catch {} ; subSeriesRef.current[i] = null }

      const data = getStockSubData(history, key, maxRank.current)
      if (!data.length) return

      try {
        let series: any
        if (isStockLine(key)) {
          series = chart.addLineSeries({ color: stockSubLineColor(key), lineWidth: 2, priceLineVisible: false })
        } else {
          series = chart.addHistogramSeries({ priceFormat: { type: 'price' }, priceLineVisible: false })
        }
        series.setData(data as any)
        subSeriesRef.current[i]  = series
        primaryRef.current[i + 1] = series

        if (key === 'rvol') {
          series.createPriceLine({ price: 1.0, color: '#9ca3af', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '1.0x' })
          series.createPriceLine({ price: 1.5, color: '#f97316', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '1.5x' })
        }
        if (key === 'mom_score') {
          series.createPriceLine({ price: 50, color: '#9ca3af', lineWidth: 1, lineStyle: 2, axisLabelVisible: false })
        }
        if (key === 'obv_trend' || key === 'ret_1d') {
          series.createPriceLine({ price: 0, color: '#9ca3af', lineWidth: 1, lineStyle: 0, axisLabelVisible: false })
        }
      } catch {}
    })
  }, [chartsReady, subKeys]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyRange = (range: TimeRange) => {
    setActive(range)
    if (!latestDate || !chartsRef.current.length) return
    if (range === 'ALL') {
      chartsRef.current.forEach(c => { try { c.timeScale().fitContent() } catch {} })
    } else {
      const from = rangeFrom(range, latestDate)
      chartsRef.current.forEach(c => {
        try { c.timeScale().setVisibleRange({ from, to: latestDate } as any) } catch {}
      })
    }
  }

  const addMA = () => {
    const p = parseInt(newPeriod)
    if (!p || p < 1 || p > 500) return
    setMaConfigs(prev => [...prev, { period: p, color: MA_PALETTE[nextId % MA_PALETTE.length], id: nextId }])
    setNextId(n => n + 1)
    setNewPeriod('')
  }
  const removeMA = (id: number) => setMaConfigs(prev => prev.filter(m => m.id !== id))

  const subRefs = [sub1Ref, sub2Ref, sub3Ref]

  return (
    <div ref={containerRef} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">

      {/* Controls: time range + MA settings */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex-wrap gap-2">
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => applyRange(r)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                activeRange === r
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          onClick={() => setMaPanel(p => !p)}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          均線設定 ⚙
        </button>
      </div>

      {/* MA panel */}
      {showMaPanel && (
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-wrap items-center gap-2">
          {maConfigs.map(ma => (
            <span
              key={ma.id}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium"
              style={{ borderColor: ma.color, color: ma.color, backgroundColor: ma.color + '18' }}
            >
              MA{ma.period}
              <button onClick={() => removeMA(ma.id)} className="leading-none hover:opacity-60 ml-0.5">×</button>
            </span>
          ))}
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={newPeriod}
              onChange={e => setNewPeriod(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addMA()}
              placeholder="天數"
              min={1} max={500}
              className="w-16 text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={addMA}
              className="text-xs text-blue-500 hover:text-blue-600 font-medium px-2 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950"
            >
              + 新增
            </button>
          </div>
        </div>
      )}

      {/* Main chart */}
      <div className="relative">
        <span className="absolute top-2 left-2 z-10 text-[10px] text-gray-400 uppercase tracking-wide pointer-events-none">
          Price Index · base=100
        </span>
        <div ref={mainRef} />
      </div>

      {/* Sub-indicator panels */}
      {subRefs.map((ref, i) => (
        <div key={i} className="border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 dark:bg-gray-900">
            <select
              value={subKeys[i]}
              onChange={e => {
                const next = [...subKeys]
                next[i] = e.target.value as SubKey
                setSubKeys(next)
              }}
              className="text-xs bg-transparent border-none text-gray-600 dark:text-gray-300 cursor-pointer focus:outline-none font-medium"
            >
              {STOCK_SUB_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
          <div ref={ref} />
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────

export function StockDetail({ info, history, subReturn }: Props) {
  const latest = history[history.length - 1]
  if (!latest) return <div className="p-8 text-center text-gray-400">No data</div>

  const stockCount   = subReturn?.stock_count ?? null
  const subRank      = subReturn?.rank_today ?? null
  const subRankTopPct = subRank != null ? 100 - Math.round(subRank / 155 * 100) : null
  const stockTopPct   = latest.rank_in_sub != null && stockCount != null
    ? 100 - Math.round(latest.rank_in_sub / stockCount * 100)
    : null

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">

      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link href="/sectors" className="text-blue-500 hover:underline">← 返回產業總覽</Link>
        {info.sub_industry && (
          <>
            <span className="text-gray-400">/</span>
            <Link href={`/sub/${info.gics_code}`} className="text-blue-500 hover:underline">
              {info.sub_industry}
            </Link>
          </>
        )}
      </div>

      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            {info.ticker}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{info.company}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {info.index_member && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {info.index_member}
              </span>
            )}
            {info.sector && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {info.sector}
              </span>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: '1D',        value: fmt(latest.ret_1d),  colorVal: latest.ret_1d },
            { label: '1M',        value: fmt(latest.ret_1m),  colorVal: latest.ret_1m },
            { label: '3M',        value: fmt(latest.ret_3m),  colorVal: latest.ret_3m },
            { label: 'Mom Score', value: latest.mom_score != null ? latest.mom_score.toFixed(1) : '—', colorVal: null },
          ].map(({ label, value, colorVal }) => (
            <div key={label} className="rounded-lg p-3 text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 min-w-[72px]">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</div>
              <div className={`text-base font-bold mt-0.5 ${colorVal != null ? retColor(colorVal) : 'text-gray-800 dark:text-gray-200'}`}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rank cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">

        {/* Sub-industry internal rank */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Sub-industry 內排名</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            #{latest.rank_in_sub ?? '—'}
            {stockCount != null && (
              <span className="text-sm font-normal text-gray-400 ml-1">/ {stockCount} 股</span>
            )}
          </div>
          {info.sub_industry && (
            <Link href={`/sub/${info.gics_code}`} className="text-xs text-blue-500 hover:underline mt-1 block">
              {info.sub_industry}
            </Link>
          )}
          {latest.rank_in_sub != null && stockCount != null && (
            <div className="mt-3">
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.max(4, stockTopPct ?? 0)}%` }}
                />
              </div>
              <div className="text-[10px] text-gray-400 mt-1">Top {stockTopPct ?? '—'}%</div>
            </div>
          )}
        </div>

        {/* Sub-industry market rank */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">板塊在全市場排名</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white">
            #{subRank ?? '—'}
            <span className="text-sm font-normal text-gray-400 ml-1">/ 155</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">{info.sub_industry ?? '—'}</div>
          {subRank != null && (
            <div className="mt-3">
              <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all"
                  style={{ width: `${Math.max(4, subRankTopPct ?? 0)}%` }}
                />
              </div>
              <div className="text-[10px] text-gray-400 mt-1">Top {subRankTopPct ?? '—'}%</div>
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
          Price Index · {info.ticker}
        </h2>
        <StockChart history={history} />
      </div>

    </div>
  )
}
