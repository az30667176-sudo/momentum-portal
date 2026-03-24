'use client'

import { useState, useMemo } from 'react'
import { SubReturn } from '@/lib/types'
import Link from 'next/link'

type Window = 'mom' | '1d' | '1w' | '1m' | '3m' | '6m' | '12m'
type SortBy = 'rank' | 'score' | 'ret_1d' | 'ret_3m' | 'sector'

const WINDOWS: { key: Window; label: string }[] = [
  { key: 'mom', label: '動能' },
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '12m', label: '12M' },
]

function getRetField(w: Window): keyof SubReturn {
  const map: Record<Window, keyof SubReturn> = {
    mom: 'mom_score',
    '1d': 'ret_1d',
    '1w': 'ret_1w',
    '1m': 'ret_1m',
    '3m': 'ret_3m',
    '6m': 'ret_6m',
    '12m': 'ret_12m',
  }
  return map[w]
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
  const [activeWindow, setActiveWindow] = useState<Window>('mom')
  const [sortBy, setSortBy] = useState<SortBy>('sector')

  const retField = getRetField(activeWindow)

  const sorted = useMemo(() => {
    const arr = [...data]
    switch (sortBy) {
      case 'rank':
        return arr.sort((a, b) => (a.rank_today ?? 999) - (b.rank_today ?? 999))
      case 'score':
        return arr.sort((a, b) => (b.mom_score ?? 0) - (a.mom_score ?? 0))
      case 'ret_1d':
        return arr.sort((a, b) => (b.ret_1d ?? -999) - (a.ret_1d ?? -999))
      case 'ret_3m':
        return arr.sort((a, b) => (b.ret_3m ?? -999) - (a.ret_3m ?? -999))
      case 'sector':
      default:
        return arr.sort((a, b) => {
          const sa = a.gics_universe?.sector ?? 'zzz'
          const sb = b.gics_universe?.sector ?? 'zzz'
          if (sa !== sb) return sa.localeCompare(sb)
          return (a.rank_today ?? 999) - (b.rank_today ?? 999)
        })
    }
  }, [data, sortBy])

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
    if (activeWindow === 'mom') return getMomColor(row.mom_score)
    return getRetColor(row[retField] as number | null)
  }

  function getMainValue(row: SubReturn): string {
    if (activeWindow === 'mom') return fmtScore(row.mom_score)
    return fmtRet(row[retField] as number | null)
  }

  const totalRows = data.length

  // Compute summary stats for header
  const topQuartile = sorted.filter(r => (r.rank_today ?? 999) <= Math.ceil(totalRows / 4)).length
  const advancing = sorted.filter(r => (r.ret_1d ?? 0) > 0).length

  return (
    <div className="p-4 md:p-6 max-w-screen-2xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-5 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Momentum Portal
          </h1>
          <div className="flex gap-4 mt-1 text-sm text-gray-500">
            {latestDate && <span>Data as of <strong className="text-gray-700 dark:text-gray-300">{latestDate}</strong></span>}
            <Link href="/" className="text-xs text-blue-500 hover:underline">← 個股視圖</Link>
          <span>{totalRows} sub-industries</span>
            <span className="text-green-600">{advancing} advancing</span>
            <span className="text-gray-400">{totalRows - advancing} declining</span>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-wrap gap-2 items-center shrink-0">
          {/* Time window pills */}
          <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {WINDOWS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveWindow(key)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                  activeWindow === key
                    ? 'bg-white dark:bg-gray-600 shadow text-gray-900 dark:text-white'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
          >
            <option value="sector">Sort: Sector</option>
            <option value="rank">Sort: Rank</option>
            <option value="score">Sort: Mom Score</option>
            <option value="ret_1d">Sort: 1D Return</option>
            <option value="ret_3m">Sort: 3M Return</option>
          </select>
        </div>
      </div>

      {/* ── Color legend ── */}
      <div className="flex items-center gap-1 mb-4 text-xs text-gray-400">
        {activeWindow === 'mom' ? (
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
