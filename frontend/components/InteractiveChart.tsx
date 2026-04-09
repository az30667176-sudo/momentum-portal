'use client'

import { useEffect, useRef, useState } from 'react'
import { SubReturn } from '@/lib/types'

// ─── Types ───────────────────────────────────────────────────

type TimeRange = '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '3Y' | 'ALL'
type SubKey = 'rank' | 'obv_trend' | 'rvol' | 'mom_score' | 'cmf' | 'mfi'

interface MAConfig { period: number; color: string; id: number }

// ─── Constants ───────────────────────────────────────────────

const MA_PALETTE = [
  '#f97316', // orange  – MA5
  '#3b82f6', // blue    – MA10
  '#22c55e', // green   – MA20
  '#a855f7', // purple  – MA100
  '#ec4899', '#14b8a6', '#f59e0b', '#ef4444',
]

const SUB_OPTIONS: { key: SubKey; label: string }[] = [
  { key: 'rank',      label: 'Rank History' },
  { key: 'obv_trend', label: 'OBV Trend' },
  { key: 'rvol',      label: 'Relative Volume' },
  { key: 'mom_score', label: 'Momentum Score' },
  { key: 'cmf',       label: 'CMF' },
  { key: 'mfi',       label: 'MFI' },
]

const RANGES: TimeRange[] = ['1M', '3M', '6M', 'YTD', '1Y', '2Y', '3Y', 'ALL']

// ─── Data helpers ────────────────────────────────────────────

function buildOHLC(history: SubReturn[]) {
  let idx = 100
  return history.map(r => {
    const prev = idx
    idx = prev * (1 + (r.ret_1d || 0) / 100)
    const noise = Math.abs(r.ret_1d || 0) * 0.15
    return {
      time: r.date,
      open: prev,
      close: idx,
      high: Math.max(prev, idx) * (1 + noise / 100),
      low:  Math.min(prev, idx) * (1 - noise / 100),
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
  else if (range === '2Y')  d.setFullYear(d.getFullYear() - 2)
  else if (range === '3Y')  d.setFullYear(d.getFullYear() - 3)
  else return '2000-01-01'
  return d.toISOString().slice(0, 10)
}

function getSubData(history: SubReturn[], key: SubKey) {
  switch (key) {
    case 'rank':
      return history
        .filter(r => r.rank_today != null)
        .map(r => ({ time: r.date, value: 156 - (r.rank_today as number) }))
    case 'obv_trend':
      return history
        .filter(r => r.obv_trend != null)
        .map(r => ({
          time: r.date,
          value: r.obv_trend as number,
          color: (r.obv_trend as number) >= 0 ? '#22c55e' : '#ef4444',
        }))
    case 'rvol':
      return history
        .filter(r => r.rvol != null)
        .map(r => ({
          time: r.date,
          value: r.rvol as number,
          color: (r.rvol as number) >= 1.5 ? '#f97316' : '#60a5fa',
        }))
    case 'mom_score':
      return history.filter(r => r.mom_score != null).map(r => ({ time: r.date, value: r.mom_score as number }))
    case 'cmf':
      return history.filter(r => r.cmf != null).map(r => ({ time: r.date, value: r.cmf as number }))
    case 'mfi':
      return history.filter(r => r.mfi != null).map(r => ({ time: r.date, value: r.mfi as number }))
    default:
      return []
  }
}

function isLine(key: SubKey) {
  return key === 'rank' || key === 'mom_score' || key === 'cmf' || key === 'mfi'
}

function subLineColor(key: SubKey) {
  if (key === 'rank')      return '#3b82f6'
  if (key === 'mom_score') return '#10b981'
  if (key === 'cmf')       return '#8b5cf6'
  if (key === 'mfi')       return '#f59e0b'
  return '#3b82f6'
}

// ─── Component ───────────────────────────────────────────────

export function InteractiveChart({ history }: { history: SubReturn[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mainRef      = useRef<HTMLDivElement>(null)
  const volRef       = useRef<HTMLDivElement>(null)
  const sub1Ref      = useRef<HTMLDivElement>(null)
  const sub2Ref      = useRef<HTMLDivElement>(null)
  const sub3Ref      = useRef<HTMLDivElement>(null)

  // Stored chart instances and series for cross-effect updates
  const chartsRef       = useRef<any[]>([])
  const primaryRef      = useRef<(any | null)[]>([null, null, null, null, null])
  const maSeriesRef     = useRef<Map<number, any>>(new Map())
  const subSeriesRef    = useRef<(any | null)[]>([null, null, null])

  const [chartsReady, setChartsReady] = useState(false)
  const [maConfigs, setMaConfigs]     = useState<MAConfig[]>([
    { period: 5,   color: MA_PALETTE[0], id: 0 },
    { period: 10,  color: MA_PALETTE[1], id: 1 },
    { period: 20,  color: MA_PALETTE[2], id: 2 },
    { period: 100, color: MA_PALETTE[3], id: 3 },
  ])
  const [subKeys, setSubKeys]     = useState<SubKey[]>(['rank', 'obv_trend', 'rvol'])
  const [activeRange, setActive]  = useState<TimeRange>('1Y')
  const [showMaPanel, setMaPanel] = useState(false)
  const [newPeriod, setNewPeriod] = useState('')
  const [nextId, setNextId]       = useState(4)

  // Stable data refs (computed once from history)
  const ohlcData  = useRef(buildOHLC(history))
  const closeData = useRef(ohlcData.current.map(d => ({ time: d.time, value: d.close })))
  const volData   = useRef(
    history.map(r => ({
      time:  r.date,
      value: Math.max(Math.abs(r.ret_1d || 0) * (r.rvol || 1) * 10, 0.01),
      color: (r.ret_1d || 0) >= 0 ? '#22c55e66' : '#ef444466',
    }))
  )
  const latestDate = history[history.length - 1]?.date ?? ''

  // ── 1. Mount: create all chart instances ─────────────────
  useEffect(() => {
    if (!mainRef.current || !volRef.current || !sub1Ref.current
      || !sub2Ref.current || !sub3Ref.current || !history.length) return

    let alive = true

    import('lightweight-charts').then(({ createChart }) => {
      if (!alive) return

      const base = {
        layout: { background: { color: '#ffffff' }, textColor: '#6b7280', fontSize: 11 },
        grid:   { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
        crosshair: { mode: 1 },          // Normal
        rightPriceScale: { borderColor: '#e5e7eb' },
        timeScale: { borderColor: '#e5e7eb', timeVisible: false, minBarSpacing: 1 },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale:  { mouseWheel: true },
      }

      const mainChart = createChart(mainRef.current!, { ...base, height: 300 })
      const volChart  = createChart(volRef.current!, {
        ...base, height: 80,
        timeScale: { ...base.timeScale, visible: false },
      })
      const s1Chart = createChart(sub1Ref.current!, { ...base, height: 120 })
      const s2Chart = createChart(sub2Ref.current!, { ...base, height: 120 })
      const s3Chart = createChart(sub3Ref.current!, { ...base, height: 120 })

      const all = [mainChart, volChart, s1Chart, s2Chart, s3Chart]
      chartsRef.current = all

      // ── Clamp zoom-out: don't allow scrolling beyond data range ──
      const totalBars = ohlcData.current.length
      all.forEach(chart => {
        chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
          if (!range || !totalBars) return
          if (range.from < -10 || range.to > totalBars + 10) {
            const cf = Math.max(-10, range.from)
            const ct = Math.min(totalBars + 10, range.to)
            if (cf !== range.from || ct !== range.to) {
              try { chart.timeScale().setVisibleLogicalRange({ from: cf, to: ct }) } catch {}
            }
          }
        })
      })

      // Candlestick
      const candle = mainChart.addCandlestickSeries({
        upColor:        '#22c55e', downColor:        '#ef4444',
        borderUpColor:  '#16a34a', borderDownColor:  '#dc2626',
        wickUpColor:    '#16a34a', wickDownColor:    '#dc2626',
      })
      candle.setData(ohlcData.current as any)

      // Volume histogram
      const volSeries = volChart.addHistogramSeries({
        color: '#22c55e',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.1, bottom: 0 },
      })
      volSeries.setData(volData.current as any)

      primaryRef.current[0] = candle
      primaryRef.current[1] = volSeries

      // ── Sync time scale across all panels ──
      let syncing = false
      all.forEach((chart, i) => {
        chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
          if (syncing || !range) return
          syncing = true
          all.forEach((c, j) => { if (j !== i) c.timeScale().setVisibleLogicalRange(range) })
          syncing = false
        })
      })

      // ── Sync crosshair ──
      all.forEach((src, si) => {
        src.subscribeCrosshairMove((param: any) => {
          all.forEach((dst, di) => {
            if (di === si) return
            const s = primaryRef.current[di]
            if (!s) return
            try {
              if (param.time) {
                dst.setCrosshairPosition(NaN, param.time, s)
              } else {
                dst.clearCrosshairPosition()
              }
            } catch {}
          })
        })
      })

      // ── Resize observer ──
      const ro = new ResizeObserver(() => {
        const w = containerRef.current?.clientWidth ?? 900
        all.forEach(c => { try { c.applyOptions({ width: w }) } catch {} })
      })
      if (containerRef.current) ro.observe(containerRef.current)
      ;(chartsRef as any)._ro = ro

      setChartsReady(true)
    })

    return () => {
      alive = false
      ;(chartsRef as any)._ro?.disconnect()
      chartsRef.current.forEach(c => { try { c.remove() } catch {} })
      chartsRef.current = []
      maSeriesRef.current.clear()
      subSeriesRef.current    = [null, null, null]
      primaryRef.current      = [null, null, null, null, null]
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Rebuild MA series on main chart ───────────────────
  useEffect(() => {
    const mainChart = chartsRef.current[0]
    if (!chartsReady || !mainChart) return

    maSeriesRef.current.forEach(s => { try { mainChart.removeSeries(s) } catch {} })
    maSeriesRef.current.clear()

    maConfigs.forEach(({ period, color, id }) => {
      try {
        const s = mainChart.addLineSeries({
          color, lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crossHairMarkerVisible: false,
        })
        s.setData(calcMA(closeData.current, period) as any)
        maSeriesRef.current.set(id, s)
      } catch {}
    })
  }, [chartsReady, maConfigs])

  // ── 3. Rebuild sub-indicator series ──────────────────────
  useEffect(() => {
    const subCharts = chartsRef.current.slice(2)
    if (!chartsReady || subCharts.length < 3) return

    subKeys.forEach((key, i) => {
      const chart = subCharts[i]
      if (!chart) return

      // Remove old series
      const old = subSeriesRef.current[i]
      if (old) { try { chart.removeSeries(old) } catch {} ; subSeriesRef.current[i] = null }

      const data = getSubData(history, key)
      if (!data.length) return

      try {
        let series: any
        if (isLine(key)) {
          series = chart.addLineSeries({ color: subLineColor(key), lineWidth: 2, priceLineVisible: false })
        } else {
          series = chart.addHistogramSeries({ priceFormat: { type: 'price' }, priceLineVisible: false })
        }
        series.setData(data as any)
        subSeriesRef.current[i]  = series
        primaryRef.current[i + 2] = series

        // Reference lines
        if (key === 'rvol') {
          series.createPriceLine({ price: 1.0, color: '#9ca3af', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '1.0x' })
          series.createPriceLine({ price: 1.5, color: '#f97316', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '1.5x' })
        }
        if (key === 'mfi') {
          series.createPriceLine({ price: 80, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'OB 80' })
          series.createPriceLine({ price: 20, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'OS 20' })
        }
        if (key === 'cmf') {
          series.createPriceLine({ price: 0, color: '#9ca3af', lineWidth: 1, lineStyle: 0, axisLabelVisible: false })
        }
        if (key === 'mom_score') {
          series.createPriceLine({ price: 50, color: '#9ca3af', lineWidth: 1, lineStyle: 2, axisLabelVisible: false })
        }
        if (key === 'rank') {
          // rank 1 = value 155, rank 155 = value 1; add midline at 78
          series.createPriceLine({ price: 78, color: '#9ca3af', lineWidth: 1, lineStyle: 2, axisLabelVisible: false })
        }
      } catch {}
    })
  }, [chartsReady, subKeys]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 4. Apply initial visible range after all series are ready ──
  const initialApplied = useRef(false)
  useEffect(() => {
    if (!chartsReady || initialApplied.current) return
    initialApplied.current = true
    // Delay so sub-indicator effects also fire first
    setTimeout(() => {
      if (!latestDate || !chartsRef.current.length) return
      const from = rangeFrom('1Y', latestDate)
      chartsRef.current.forEach(c => {
        try { c.timeScale().setVisibleRange({ from, to: latestDate } as any) } catch {}
      })
    }, 50)
  }, [chartsReady]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Time range ────────────────────────────────────────────
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

  // ── MA management ─────────────────────────────────────────
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

      {/* Top controls: time range + MA settings */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex-wrap gap-2">
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => applyRange(r)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                activeRange === r
                  ? 'bg-emerald-500 text-white'
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
              className="w-16 text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-emerald-400"
            />
            <button
              onClick={addMA}
              className="text-xs text-emerald-500 hover:text-emerald-600 font-medium px-2 py-0.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950"
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

      {/* Volume */}
      <div className="relative border-t border-gray-100 dark:border-gray-700">
        <span className="absolute top-1 left-2 z-10 text-[10px] text-gray-400 uppercase tracking-wide pointer-events-none">
          Vol
        </span>
        <div ref={volRef} />
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
              {SUB_OPTIONS.map(o => (
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
