'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { StockHeatmapEntry } from '@/lib/types'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────

type TimeWindow = '1d' | '1w' | '1m' | '3m' | 'mom'
type SizeFilter = 'all' | 'large' | 'mid' | 'small'
type CellSize = 'sm' | 'md' | 'lg'

const WINDOWS: { key: TimeWindow; label: string }[] = [
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: 'mom', label: '動能' },
]

const SIZES: { key: SizeFilter; label: string; sub: string }[] = [
  { key: 'all',   label: '全部', sub: '' },
  { key: 'large', label: '大型', sub: 'S&P500' },
  { key: 'mid',   label: '中型', sub: 'S&P400' },
  { key: 'small', label: '小型', sub: 'S&P600' },
]

const CELL_SIZES: Record<CellSize, { w: string; h: string; ticker: string; ret: string }> = {
  sm: { w: 'w-[72px]',  h: 'h-[46px]',  ticker: 'text-[11px]', ret: 'text-[10px]' },
  md: { w: 'w-[88px]',  h: 'h-[54px]',  ticker: 'text-[12px]', ret: 'text-[11px]' },
  lg: { w: 'w-[108px]', h: 'h-[66px]',  ticker: 'text-[14px]', ret: 'text-[12px]' },
}

// ── Color engine ─────────────────────────────────────────────

interface CellColor { bg: string; text: string; border: string }

function retColor(val: number | null): CellColor {
  if (val === null) return { bg: '#f0f1f3', text: '#9ca3af', border: '#e5e7eb' }
  if (val >=  20) return { bg: '#014421', text: '#d1fae5', border: '#065f46' }
  if (val >=  12) return { bg: '#065f46', text: '#a7f3d0', border: '#047857' }
  if (val >=   6) return { bg: '#047857', text: '#ffffff', border: '#059669' }
  if (val >=   2) return { bg: '#10b981', text: '#ffffff', border: '#059669' }
  if (val >=  0.5) return { bg: '#6ee7b7', text: '#064e3b', border: '#34d399' }
  if (val >= -0.5) return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
  if (val >=  -2) return { bg: '#fecaca', text: '#7f1d1d', border: '#fca5a5' }
  if (val >=  -6) return { bg: '#ef4444', text: '#ffffff', border: '#dc2626' }
  if (val >= -12) return { bg: '#b91c1c', text: '#fecaca', border: '#991b1b' }
  return { bg: '#7f1d1d', text: '#fecaca', border: '#6b1515' }
}

function momColor(val: number | null): CellColor {
  if (val === null) return { bg: '#f0f1f3', text: '#9ca3af', border: '#e5e7eb' }
  if (val >= 88) return { bg: '#014421', text: '#d1fae5', border: '#065f46' }
  if (val >= 75) return { bg: '#065f46', text: '#a7f3d0', border: '#047857' }
  if (val >= 62) return { bg: '#10b981', text: '#ffffff', border: '#059669' }
  if (val >= 52) return { bg: '#6ee7b7', text: '#064e3b', border: '#34d399' }
  if (val >= 45) return { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
  if (val >= 35) return { bg: '#fecaca', text: '#7f1d1d', border: '#fca5a5' }
  if (val >= 22) return { bg: '#ef4444', text: '#ffffff', border: '#dc2626' }
  return { bg: '#7f1d1d', text: '#fecaca', border: '#6b1515' }
}

function getColor(entry: StockHeatmapEntry, window: TimeWindow): CellColor {
  if (!entry.hasReturns) return { bg: '#f9fafb', text: '#d1d5db', border: '#f3f4f6' }
  if (window === 'mom') return momColor(entry.mom_score)
  const val = window === '1d' ? entry.ret_1d
            : window === '1w' ? entry.ret_1w
            : window === '1m' ? entry.ret_1m
            : entry.ret_3m
  return retColor(val)
}

function getDisplayValue(entry: StockHeatmapEntry, window: TimeWindow): string {
  if (!entry.hasReturns) return '—'
  if (window === 'mom') return entry.mom_score != null ? entry.mom_score.toFixed(0) : '—'
  const val = window === '1d' ? entry.ret_1d
            : window === '1w' ? entry.ret_1w
            : window === '1m' ? entry.ret_1m
            : entry.ret_3m
  if (val == null) return '—'
  return (val >= 0 ? '+' : '') + val.toFixed(1) + '%'
}

// ── Sector returns (avg of stocks) ───────────────────────────

function calcSectorReturn(stocks: StockHeatmapEntry[], window: TimeWindow): number | null {
  const vals = stocks
    .map(s => window === 'mom' ? s.mom_score
              : window === '1d' ? s.ret_1d
              : window === '1w' ? s.ret_1w
              : window === '1m' ? s.ret_1m
              : s.ret_3m)
    .filter((v): v is number => v != null)
  if (!vals.length) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

// ── Tooltip ──────────────────────────────────────────────────

function Tooltip({ entry, visible }: { entry: StockHeatmapEntry; visible: boolean }) {
  if (!visible) return null
  return (
    <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none">
      <div className="bg-gray-900 text-white rounded-xl shadow-2xl p-3 w-52 text-xs border border-gray-700">
        <div className="font-bold text-sm mb-0.5">{entry.ticker}</div>
        <div className="text-gray-400 text-[11px] mb-2 leading-tight truncate">{entry.company}</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          {[
            ['1D', entry.ret_1d],
            ['1W', entry.ret_1w],
            ['1M', entry.ret_1m],
            ['3M', entry.ret_3m],
          ].map(([label, val]) => (
            <div key={String(label)} className="flex justify-between">
              <span className="text-gray-500">{label}</span>
              <span className={
                val == null ? 'text-gray-500'
                : (val as number) >= 0 ? 'text-emerald-400' : 'text-red-400'
              }>
                {val != null ? `${(val as number) >= 0 ? '+' : ''}${(val as number).toFixed(1)}%` : '—'}
              </span>
            </div>
          ))}
          {entry.rvol != null && (
            <>
              <span className="text-gray-500">RVol</span>
              <span className={entry.rvol >= 1.5 ? 'text-yellow-400' : 'text-gray-300'}>
                {entry.rvol.toFixed(2)}x
              </span>
            </>
          )}
          {entry.rank_in_sub != null && (
            <>
              <span className="text-gray-500">Sub Rank</span>
              <span className="text-gray-300">#{entry.rank_in_sub}</span>
            </>
          )}
        </div>
        <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-gray-500">
          {entry.index_member} · {entry.sub_industry}
        </div>
      </div>
      <div className="w-2 h-2 bg-gray-900 border-r border-b border-gray-700 rotate-45 mx-auto -mt-1" />
    </div>
  )
}

// ── Stock Cell ────────────────────────────────────────────────

function StockCell({
  entry, window, cellSize,
}: {
  entry: StockHeatmapEntry
  window: TimeWindow
  cellSize: CellSize
}) {
  const [hovered, setHovered] = useState(false)
  const color = getColor(entry, window)
  const value = getDisplayValue(entry, window)
  const sz = CELL_SIZES[cellSize]

  return (
    <div className="relative">
      <Link href={`/stock/${entry.ticker}`}>
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            backgroundColor: color.bg,
            color: color.text,
            borderColor: color.border,
          }}
          className={`
            ${sz.w} ${sz.h} rounded-md border cursor-pointer select-none
            flex flex-col justify-center px-1.5
            transition-transform duration-100 ease-out
            ${hovered ? 'scale-105 shadow-lg z-10 relative' : ''}
          `}
        >
          <div className={`${sz.ticker} font-bold leading-none tracking-tight`}>
            {entry.ticker}
          </div>
          <div className={`${sz.ret} font-semibold leading-none mt-1 opacity-90`}>
            {value}
          </div>
        </div>
      </Link>
      <Tooltip entry={entry} visible={hovered} />
    </div>
  )
}

// ── Sub-industry row ─────────────────────────────────────────

function SubIndustryRow({
  name, stocks, window, cellSize,
}: {
  name: string
  stocks: StockHeatmapEntry[]
  window: TimeWindow
  cellSize: CellSize
}) {
  const avgRet = calcSectorReturn(stocks, window)
  const avgColor = window === 'mom' ? momColor(avgRet) : retColor(avgRet)

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-1.5 px-0.5">
        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 tracking-wide">
          {name}
        </span>
        <span className="text-[10px] text-gray-400">· {stocks.length}股</span>
        {avgRet != null && (
          <span
            style={{ backgroundColor: avgColor.bg, color: avgColor.text }}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded ml-auto"
          >
            avg {avgRet >= 0 ? '+' : ''}{avgRet.toFixed(1)}{window === 'mom' ? '' : '%'}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {stocks.map((s) => (
          <StockCell key={s.ticker} entry={s} window={window} cellSize={cellSize} />
        ))}
      </div>
    </div>
  )
}

// ── Sector block ─────────────────────────────────────────────

const SECTOR_COLORS: Record<string, string> = {
  'Information Technology':    '#3b82f6',
  'Health Care':               '#10b981',
  'Financials':                '#f59e0b',
  'Consumer Discretionary':    '#8b5cf6',
  'Communication Services':    '#06b6d4',
  'Industrials':               '#64748b',
  'Consumer Staples':          '#84cc16',
  'Energy':                    '#f97316',
  'Utilities':                 '#a78bfa',
  'Real Estate':               '#ec4899',
  'Materials':                 '#6b7280',
}

function SectorBlock({
  sector, subGroups, window, cellSize,
}: {
  sector: string
  subGroups: Record<string, StockHeatmapEntry[]>
  window: TimeWindow
  cellSize: CellSize
}) {
  const allStocks = Object.values(subGroups).flat()
  const sectorRet = calcSectorReturn(allStocks, window)
  const accent = SECTOR_COLORS[sector] ?? '#6b7280'
  const retColor2 = window === 'mom' ? momColor(sectorRet) : retColor(sectorRet)

  return (
    <div className="mb-8">
      {/* Sector header */}
      <div
        className="flex items-center gap-3 mb-3 pb-2"
        style={{ borderBottom: `2px solid ${accent}20` }}
      >
        <div
          className="w-1 h-6 rounded-full shrink-0"
          style={{ backgroundColor: accent }}
        />
        <span className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
          {sector}
        </span>
        <span className="text-xs text-gray-400">
          {allStocks.length} stocks
        </span>
        {sectorRet != null && (
          <div
            style={{ backgroundColor: retColor2.bg, color: retColor2.text }}
            className="ml-auto text-xs font-bold px-2.5 py-1 rounded-lg"
          >
            {window === 'mom' ? `Score ${sectorRet.toFixed(0)}` : `${sectorRet >= 0 ? '+' : ''}${sectorRet.toFixed(1)}%`}
          </div>
        )}
      </div>

      {/* Sub-industries */}
      <div className="pl-3">
        {Object.entries(subGroups)
          .sort(([, a], [, b]) => {
            const ra = calcSectorReturn(a, window) ?? -999
            const rb = calcSectorReturn(b, window) ?? -999
            return rb - ra
          })
          .map(([sub, stocks]) => (
            <SubIndustryRow
              key={sub}
              name={sub}
              stocks={stocks}
              window={window}
              cellSize={cellSize}
            />
          ))}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────

interface Props {
  entries: StockHeatmapEntry[]
  date: string | null
}

export function StockHeatmap({ entries, date }: Props) {
  const [activeWindow, setActiveWindow] = useState<TimeWindow>('3m')
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('all')
  const [cellSize, setCellSize] = useState<CellSize>('md')
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const filtered = useMemo(() => {
    let d = entries
    if (sizeFilter === 'large') d = d.filter(s => s.index_member === 'SP500')
    if (sizeFilter === 'mid')   d = d.filter(s => s.index_member === 'SP400')
    if (sizeFilter === 'small') d = d.filter(s => s.index_member === 'SP600')
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      d = d.filter(s =>
        s.ticker.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q) ||
        s.sub_industry.toLowerCase().includes(q)
      )
    }
    return d
  }, [entries, sizeFilter, search])

  // Group by sector → sub_industry, sorted by avg return desc
  const grouped = useMemo(() => {
    const sectors: Record<string, Record<string, StockHeatmapEntry[]>> = {}
    for (const s of filtered) {
      if (!sectors[s.sector]) sectors[s.sector] = {}
      if (!sectors[s.sector][s.sub_industry]) sectors[s.sector][s.sub_industry] = []
      sectors[s.sector][s.sub_industry].push(s)
    }
    // Sort stocks within each sub by the active window desc
    for (const sec of Object.values(sectors)) {
      for (const arr of Object.values(sec)) {
        arr.sort((a, b) => {
          const va = (activeWindow === 'mom' ? a.mom_score : activeWindow === '1d' ? a.ret_1d : activeWindow === '1w' ? a.ret_1w : activeWindow === '1m' ? a.ret_1m : a.ret_3m) ?? -999
          const vb = (activeWindow === 'mom' ? b.mom_score : activeWindow === '1d' ? b.ret_1d : activeWindow === '1w' ? b.ret_1w : activeWindow === '1m' ? b.ret_1m : b.ret_3m) ?? -999
          return vb - va
        })
      }
    }
    return sectors
  }, [filtered, activeWindow])

  // Sort sectors by avg return desc
  const sortedSectors = useMemo(() => {
    return Object.entries(grouped).sort(([, subA], [, subB]) => {
      const allA = Object.values(subA).flat()
      const allB = Object.values(subB).flat()
      const ra = calcSectorReturn(allA, activeWindow) ?? -999
      const rb = calcSectorReturn(allB, activeWindow) ?? -999
      return rb - ra
    })
  }, [grouped, activeWindow])

  const hasData = entries.some(e => e.hasReturns)
  const advancing = filtered.filter(e => {
    const v = activeWindow === '1d' ? e.ret_1d : activeWindow === '1w' ? e.ret_1w : activeWindow === '1m' ? e.ret_1m : e.ret_3m
    return v != null && v > 0
  }).length

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Title */}
            <div className="flex items-baseline gap-2 mr-2">
              <span className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                市場掃描
              </span>
              <span className="text-xs text-gray-400">個股</span>
            </div>

            {/* Nav link to sector view */}
            <Link
              href="/sectors"
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-md px-2 py-1 transition-colors"
            >
              Sector View →
            </Link>

            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

            {/* Time window */}
            <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg">
              {WINDOWS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveWindow(key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    activeWindow === key
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Size filter */}
            <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg">
              {SIZES.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSizeFilter(key)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    sizeFilter === key
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Cell size */}
            <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg">
              {(['sm', 'md', 'lg'] as CellSize[]).map((s, i) => (
                <button
                  key={s}
                  onClick={() => setCellSize(s)}
                  className={`px-2 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    cellSize === s
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {['小', '中', '大'][i]}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative flex-1 min-w-[160px] max-w-xs ml-auto">
              <input
                ref={searchRef}
                type="text"
                placeholder="搜尋 ticker…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 mt-2 text-[11px] text-gray-400">
            {date && <span>Data: <strong className="text-gray-600 dark:text-gray-300">{date}</strong></span>}
            <span>{filtered.length} stocks</span>
            {hasData && (
              <>
                <span className="text-emerald-500">▲ {advancing} advancing</span>
                <span className="text-red-500">▼ {filtered.filter(e => e.hasReturns).length - advancing} declining</span>
              </>
            )}
            {!hasData && (
              <span className="text-amber-500">
                Pipeline has not yet populated stock returns — will appear after next daily run
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-screen-2xl mx-auto px-4 py-6">
        {sortedSectors.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            {search ? `No results for "${search}"` : 'No data available'}
          </div>
        ) : (
          sortedSectors.map(([sector, subGroups]) => (
            <SectorBlock
              key={sector}
              sector={sector}
              subGroups={subGroups}
              window={activeWindow}
              cellSize={cellSize}
            />
          ))
        )}
      </div>
    </div>
  )
}
