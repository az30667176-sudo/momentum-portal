'use client'
import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { SubReturn, StockReturn, StockHeatmapEntry } from '@/lib/types'
import { StockHeatmap } from '@/components/StockHeatmap'

type Mode = 'by-sub' | 'table'
type SortCol = '1w' | '1m' | '3m' | '6m' | '1y' | 'mom'
type SortDir = 'asc' | 'desc'
type IndexFilter = 'all' | 'SP500' | 'SP400' | 'SP600'

interface Props {
  subData: SubReturn[]
  stockData: StockReturn[]
  heatmapEntries?: StockHeatmapEntry[]
  heatmapDate?: string | null
}

function getRetVal(s: StockReturn, col: SortCol): number | null {
  if (col === '1w')  return s.ret_1w
  if (col === '1m')  return s.ret_1m
  if (col === '3m')  return s.ret_3m
  if (col === '6m')  return s.ret_6m
  if (col === '1y')  return s.ret_12m
  if (col === 'mom') return s.mom_score ?? null
  return null
}

export function StockRanking({ subData, stockData, heatmapEntries = [], heatmapDate = null }: Props) {
  const [mode, setMode]               = useState<Mode>('by-sub')
  const [indexFilter, setIndexFilter] = useState<IndexFilter>('all')
  const [search, setSearch]           = useState('')
  const [page, setPage]               = useState(0)
  const [sortCol, setSortCol]         = useState<SortCol>('1m')
  const [sortDir, setSortDir]         = useState<SortDir>('desc')
  const PAGE_SIZE = 50

  const getCompany     = (s: StockReturn) => (s as any).stock_universe?.company      ?? ''
  const getIndexMember = (s: StockReturn) => (s as any).stock_universe?.index_member ?? ''
  const getSector      = (s: StockReturn) => (s as any).gics_universe?.sector        ?? ''
  const getSubIndustry = (s: StockReturn) => (s as any).gics_universe?.sub_industry  ?? ''

  // Sub-industry mom_score map as fallback when stock-level mom_score is null
  const subMomMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const sub of subData) {
      if (sub.mom_score != null) m.set(sub.gics_code, sub.mom_score)
    }
    return m
  }, [subData])

  const getMom = (s: StockReturn): number | null =>
    s.mom_score ?? subMomMap.get(s.gics_code) ?? null

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
    setPage(0)
  }

  const filtered = useMemo(() => {
    let data = stockData
    if (indexFilter !== 'all') data = data.filter(s => getIndexMember(s) === indexFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(s => s.ticker.toLowerCase().includes(q) || getCompany(s).toLowerCase().includes(q))
    }
    return data
  }, [stockData, indexFilter, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = sortCol === 'mom' ? getMom(a) : getRetVal(a, sortCol)
      const bv = sortCol === 'mom' ? getMom(b) : getRetVal(b, sortCol)
      const an = av ?? (sortDir === 'desc' ? -Infinity : Infinity)
      const bn = bv ?? (sortDir === 'desc' ? -Infinity : Infinity)
      return sortDir === 'desc' ? bn - an : an - bn
    })
  }, [filtered, sortCol, sortDir, subMomMap])

  const pageData   = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  const fmtPct = (v: number | null | undefined) =>
    v == null ? <span className="text-gray-300">—</span>
              : <span className={v >= 0 ? 'text-green-600' : 'text-red-500'}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>

  const modeBtnCls = (m: Mode) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      mode === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
    }`

  const ColHeader = ({ col, label }: { col: SortCol; label: string }) => (
    <th
      className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 cursor-pointer select-none hover:text-blue-600 whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      {label}{' '}
      <span className="text-gray-400">
        {sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
      </span>
    </th>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">個股排名</h1>

      {/* Mode tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button className={modeBtnCls('by-sub')} onClick={() => setMode('by-sub')}>依 Sub-industry 分類</button>
        <button className={modeBtnCls('table')}  onClick={() => { setMode('table'); setPage(0) }}>依報酬排名</button>
      </div>

      {/* Mode 1: sub-industry heatmap tiles */}
      {mode === 'by-sub' && (
        <div className="-mx-4 -mb-4">
          <StockHeatmap entries={heatmapEntries} date={heatmapDate} />
        </div>
      )}

      {/* Mode 2: full return table */}
      {mode === 'table' && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <div className="flex gap-1">
              {(['all','SP500','SP400','SP600'] as IndexFilter[]).map(f => (
                <button key={f} onClick={() => { setIndexFilter(f); setPage(0) }}
                  className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${
                    indexFilter === f
                      ? 'bg-gray-700 dark:bg-gray-300 text-white dark:text-gray-900'
                      : 'bg-gray-100 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}>
                  {f === 'all' ? '全部' : f}
                </button>
              ))}
            </div>
            <input
              type="text" placeholder="搜尋 Ticker / 公司名..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:text-white w-52"
            />
            <span className="text-sm text-gray-500">{sorted.length} 檔</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 w-8">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">Ticker</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">公司名</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">Sector</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">Sub-industry</th>
                  <ColHeader col="1w"  label="1W" />
                  <ColHeader col="1m"  label="1M" />
                  <ColHeader col="3m"  label="3M" />
                  <ColHeader col="6m"  label="6M" />
                  <ColHeader col="1y"  label="1Y" />
                  <ColHeader col="mom" label="Mom Score" />
                </tr>
              </thead>
              <tbody>
                {pageData.map((s, i) => {
                  const rank = page * PAGE_SIZE + i
                  const momVal = getMom(s)
                  return (
                    <tr key={s.ticker} className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-3 py-2 text-gray-400 text-xs">{rank + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/stock/${s.ticker}`} className="text-blue-600 hover:underline font-medium">{s.ticker}</Link>
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[140px] truncate text-xs">{getCompany(s)}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs max-w-[100px] truncate">{getSector(s)}</td>
                      <td className="px-3 py-2 text-xs">
                        <Link href={`/sub/${s.gics_code}`} className="text-gray-600 dark:text-gray-400 hover:text-blue-600 hover:underline">
                          {getSubIndustry(s)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{fmtPct(s.ret_1w)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{fmtPct(s.ret_1m)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{fmtPct(s.ret_3m)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{fmtPct(s.ret_6m)}</td>
                      <td className="px-3 py-2 font-mono text-xs">{fmtPct(s.ret_12m)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-blue-600">
                        {momVal != null ? momVal.toFixed(1) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 text-sm bg-gray-100 rounded disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-600">← 上一頁</button>
            <span className="text-sm text-gray-600 dark:text-gray-400">第 {page + 1} / {totalPages} 頁</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-sm bg-gray-100 rounded disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-600">下一頁 →</button>
          </div>
        </>
      )}
    </div>
  )
}
