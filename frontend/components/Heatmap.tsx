'use client'

import { useState, useMemo } from 'react'
import { SubReturn } from '@/lib/types'
import Link from 'next/link'

type SubWindow = 'mom' | '1d' | '1w' | '1m' | '3m' | '6m' | '12m'
type DisplayMode = 'momentum' | 'return'
type ReturnWindow = '1w' | '1m' | '3m' | '6m' | '12m'
type SortBy =
  | 'rank'
  | 'rank_asc'
  | 'sector'
  | 'delta_rank'
  | 'breadth'
  | 'rvol'
  | 'ret_desc'
  | 'ret_asc'

const returnField: Record<ReturnWindow, keyof SubReturn> = {
  '1w': 'ret_1w',
  '1m': 'ret_1m',
  '3m': 'ret_3m',
  '6m': 'ret_6m',
  '12m': 'ret_12m',
}

function getMomColor(score: number | null): string {
  if (score === null) return 'bg-gray-200 dark:bg-gray-700 text-gray-500'
  if (score >= 85) return 'bg-green-700 text-white'
  if (score >= 70) return 'bg-green-500 text-white'
  if (score >= 55) return 'bg-green-300 text-gray-900'
  if (score >= 45) return 'bg-yellow-200 text-gray-900'
  if (score >= 35) return 'bg-orange-400 text-white'
  if (score >= 20) return 'bg-red-500 text-white'
  return 'bg-red-700 text-white'
}

function getRetColor(ret: number | null): string {
  if (ret === null) return 'bg-gray-200 dark:bg-gray-700 text-gray-500'
  if (ret >= 15) return 'bg-green-800 text-white'
  if (ret >= 8) return 'bg-green-600 text-white'
  if (ret >= 3) return 'bg-green-400 text-white'
  if (ret >= 0.5) return 'bg-green-200 text-gray-900'
  if (ret >= -0.5) return 'bg-gray-100 text-gray-700'
  if (ret >= -3) return 'bg-red-200 text-gray-900'
  if (ret >= -8) return 'bg-red-400 text-white'
  if (ret >= -15) return 'bg-red-600 text-white'
  return 'bg-red-800 text-white'
}

function fmtRet(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}

function fmtScore(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return v.toFixed(1)
}

interface Props {
  data: SubReturn[]
  latestDate: string | null
}

export function Heatmap({ data, latestDate }: Props) {
  const [displayMode, setDisplayMode] = useState<DisplayMode>('momentum')
  const [returnWindow, setReturnWindow] = useState<ReturnWindow>('12m')
  const [sortBy, setSortBy] = useState<SortBy>('sector')

  // Legacy activeWindow kept for color/value logic
  const activeWindow: SubWindow = displayMode === 'momentum' ? 'mom' : returnWindow

  function handleSetDisplayMode(mode: DisplayMode) {
    setDisplayMode(mode)
    if (mode === 'return') {
      setReturnWindow('12m')
      setSortBy('ret_desc')
    } else {
      setSortBy('sector')
    }
  }

  function handleSetReturnWindow(w: ReturnWindow) {
    setReturnWindow(w)
    setSortBy('ret_desc')
  }

  const sorted = useMemo(() => {
    const arr = [...data]
    switch (sortBy) {
      case 'rank':
        return arr.sort((a, b) => (a.rank_today ?? 999) - (b.rank_today ?? 999))
      case 'rank_asc':
        return arr.sort((a, b) => (b.rank_today ?? 0) - (a.rank_today ?? 0))
      case 'delta_rank':
        return arr.sort((a, b) => (b.delta_rank ?? -999) - (a.delta_rank ?? -999))
      case 'breadth':
        return arr.sort((a, b) => (b.breadth_pct ?? -999) - (a.breadth_pct ?? -999))
      case 'rvol':
        return arr.sort((a, b) => (b.rvol ?? -999) - (a.rvol ?? -999))
      case 'ret_desc': {
        const field = returnField[returnWindow]
        return arr.sort((a, b) => ((b[field] as number) ?? -999) - ((a[field] as number) ?? -999))
      }
      case 'ret_asc': {
        const field = returnField[returnWindow]
        return arr.sort((a, b) => ((a[field] as number) ?? 999) - ((b[field] as number) ?? 999))
      }
      case 'sector':
      default:
        return arr.sort((a, b) => {
          const sa = a.gics_universe?.sector ?? 'zzz'
          const sb = b.gics_universe?.sector ?? 'zzz'
          if (sa !== sb) return sa.localeCompare(sb)
          return (a.rank_today ?? 999) - (b.rank_today ?? 999)
        })
    }
  }, [data, sortBy, returnWindow])

  // When sorting by sector, group by sector; otherwise one flat group
  const groups = useMemo(() => {
    if (sortBy === 'sector') {
      const map: Record<string, SubReturn[]> = {}
      for (const row of sorted) {
        const sector = row.gics_universe?.sector ?? 'Unknown'
        if (!map[sector]) map[sector] = []
        map[sector].push(row)
      }
      return map
    }
    return { '': sorted }
  }, [sorted, sortBy])

  function getColor(row: SubReturn): string {
    if (displayMode === 'momentum') return getMomColor(row.mom_score)
    return getRetColor(row[returnField[returnWindow]] as number | null)
  }

  function getMainValue(row: SubReturn): string {
    if (displayMode === 'momentum') return fmtScore(row.mom_score)
    return fmtRet(row[returnField[returnWindow]] as number | null)
  }

  const totalRows = data.length
  const advancing = sorted.filter(r => (r.ret_1d ?? 0) > 0).length

  const btnBase = 'px-3 py-1.5 text-xs rounded font-medium transition-colors'
  const btnActive = 'bg-emerald-600 text-white'
  const btnInactive = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'

  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            產業總覽
          </h1>
          <div className="flex gap-4 mt-1 text-sm text-gray-500">
            {latestDate && <span>Data as of <strong className="text-gray-700 dark:text-gray-300">{latestDate}</strong></span>}
            <span>{totalRows} sub-industries</span>
            <span className="text-green-600">{advancing} advancing</span>
            <span className="text-gray-400">{totalRows - advancing} declining</span>
          </div>
        </div>
      </div>

      {/* ── Control bar ── */}
      <div className="flex flex-col gap-2 mb-4">
        {/* Row 1: Display mode */}
        <div className="flex gap-1">
          <button
            onClick={() => handleSetDisplayMode('momentum')}
            className={`${btnBase} ${displayMode === 'momentum' ? btnActive : btnInactive}`}
          >
            動能分數
          </button>
          <button
            onClick={() => handleSetDisplayMode('return')}
            className={`${btnBase} ${displayMode === 'return' ? btnActive : btnInactive}`}
          >
            報酬
          </button>
        </div>

        {/* Row 2: Sort/window controls conditional on displayMode */}
        {displayMode === 'momentum' ? (
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setSortBy('rank')} className={`${btnBase} ${sortBy === 'rank' ? btnActive : btnInactive}`}>強→弱</button>
            <button onClick={() => setSortBy('rank_asc')} className={`${btnBase} ${sortBy === 'rank_asc' ? btnActive : btnInactive}`}>弱→強</button>
            <button onClick={() => setSortBy('sector')} className={`${btnBase} ${sortBy === 'sector' ? btnActive : btnInactive}`}>GICS順序</button>
            <button onClick={() => setSortBy('delta_rank')} className={`${btnBase} ${sortBy === 'delta_rank' ? btnActive : btnInactive}`}>ΔRank最大</button>
            <button onClick={() => setSortBy('breadth')} className={`${btnBase} ${sortBy === 'breadth' ? btnActive : btnInactive}`}>廣度最高</button>
            <button onClick={() => setSortBy('rvol')} className={`${btnBase} ${sortBy === 'rvol' ? btnActive : btnInactive}`}>RVol最高</button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            {/* Time windows */}
            <div className="flex gap-1">
              {(['1w', '1m', '3m', '6m', '12m'] as ReturnWindow[]).map(w => (
                <button
                  key={w}
                  onClick={() => handleSetReturnWindow(w)}
                  className={`${btnBase} ${returnWindow === w ? btnActive : btnInactive}`}
                >
                  {w === '12m' ? '1Y' : w.toUpperCase()}
                </button>
              ))}
            </div>
            {/* Sort direction */}
            <div className="flex gap-1 border-l border-gray-200 dark:border-gray-600 pl-2">
              <button onClick={() => setSortBy('ret_desc')} className={`${btnBase} ${sortBy === 'ret_desc' ? btnActive : btnInactive}`}>強→弱</button>
              <button onClick={() => setSortBy('ret_asc')} className={`${btnBase} ${sortBy === 'ret_asc' ? btnActive : btnInactive}`}>弱→強</button>
              <button onClick={() => setSortBy('sector')} className={`${btnBase} ${sortBy === 'sector' ? btnActive : btnInactive}`}>GICS順序</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Color legend ── */}
      <div className="flex items-center gap-1 mb-4 text-xs text-gray-400">
        {displayMode === 'momentum' ? (
          <>
            <span>Momentum:</span>
            {[
              { label: '85+', cls: 'bg-green-700' },
              { label: '70', cls: 'bg-green-500' },
              { label: '55', cls: 'bg-green-300' },
              { label: '45', cls: 'bg-yellow-200 border border-yellow-300' },
              { label: '35', cls: 'bg-orange-400' },
              { label: '20', cls: 'bg-red-500' },
              { label: '<20', cls: 'bg-red-700' },
            ].map(({ label, cls }) => (
              <span key={label} className={`${cls} text-xs px-1.5 py-0.5 rounded`}>{label}</span>
            ))}
          </>
        ) : (
          <>
            <span>Return:</span>
            {[
              { label: '>15%', cls: 'bg-green-800 text-white' },
              { label: '>3%', cls: 'bg-green-400' },
              { label: '±0.5%', cls: 'bg-gray-100 text-gray-600 border border-gray-200' },
              { label: '<-3%', cls: 'bg-red-400 text-white' },
              { label: '<-15%', cls: 'bg-red-800 text-white' },
            ].map(({ label, cls }) => (
              <span key={label} className={`${cls} text-xs px-1.5 py-0.5 rounded`}>{label}</span>
            ))}
          </>
        )}
      </div>

      {/* ── Grid ── */}
      {Object.entries(groups).map(([sector, rows]) => (
        <div key={sector} className="mb-6">
          {sector && (
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              {sector}
              <span className="ml-1.5 font-normal text-gray-400">({rows.length})</span>
            </h2>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5">
            {rows.map((row) => (
              <Link
                key={row.gics_code}
                href={`/sub/${row.gics_code}`}
                className={`rounded-lg p-2.5 ${getColor(row)} hover:opacity-85 hover:scale-[1.02] transition-all cursor-pointer`}
              >
                {/* Sub-industry name */}
                <div className="text-[11px] font-medium leading-snug mb-1 min-h-[2.4em] line-clamp-2">
                  {row.gics_universe?.sub_industry ?? row.gics_code}
                </div>

                {/* Main metric (large) */}
                <div className="text-base font-bold tracking-tight">
                  {getMainValue(row)}
                </div>

                {/* Row: 1D return | rank + delta */}
                <div className="flex items-center justify-between mt-1 text-[10px] opacity-85">
                  <span>1D {fmtRet(row.ret_1d)}</span>
                  <span className="font-medium">
                    #{row.rank_today ?? '—'}
                    {row.delta_rank !== null && row.delta_rank !== 0 && (
                      <span className={row.delta_rank > 0 ? 'text-green-200' : 'text-red-200'}>
                        {' '}{row.delta_rank > 0 ? '▲' : '▼'}{Math.abs(row.delta_rank)}
                      </span>
                    )}
                  </span>
                </div>

                {/* Row: 1W return | stock count */}
                <div className="flex items-center justify-between mt-0.5 text-[10px] opacity-70">
                  <span>1W {fmtRet(row.ret_1w)}</span>
                  {row.stock_count != null && (
                    <span>n={row.stock_count}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
