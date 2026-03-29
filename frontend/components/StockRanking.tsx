'use client'
import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { SubReturn, StockReturn, StockHeatmapEntry } from '@/lib/types'
import { StockHeatmap } from '@/components/StockHeatmap'

type Mode = 'by-sub' | 'by-return' | 'by-momentum'
type ReturnWindow = '1w' | '1m' | '3m' | '6m'
type IndexFilter = 'all' | 'SP500' | 'SP400' | 'SP600'

interface Props {
  subData: SubReturn[]
  stockData: StockReturn[]  // includes nested stock_universe and gics_universe from join
  heatmapEntries?: StockHeatmapEntry[]
  heatmapDate?: string | null
}

export function StockRanking({ subData, stockData, heatmapEntries = [], heatmapDate = null }: Props) {
  const [mode, setMode] = useState<Mode>('by-sub')
  const [returnWindow, setReturnWindow] = useState<ReturnWindow>('1m')
  const [indexFilter, setIndexFilter] = useState<IndexFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [momFilter, setMomFilter] = useState<string | null>(null)
  const PAGE_SIZE = 50

  // Helper to get nested values from joined data
  const getCompany = (s: StockReturn) => (s as any).stock_universe?.company ?? ''
  const getIndexMember = (s: StockReturn) => (s as any).stock_universe?.index_member ?? ''
  const getSector = (s: StockReturn) => (s as any).gics_universe?.sector ?? ''
  const getSubIndustry = (s: StockReturn) => (s as any).gics_universe?.sub_industry ?? ''

  // StockReturn has ret_1d, ret_1w, ret_1m, ret_3m — no ret_6m
  const returnField: Record<ReturnWindow, keyof StockReturn> = {
    '1w': 'ret_1w',
    '1m': 'ret_1m',
    '3m': 'ret_3m',
    '6m': 'ret_3m',  // fallback: ret_6m not in StockReturn type
  }

  const filtered = useMemo(() => {
    let data = stockData
    if (indexFilter !== 'all') data = data.filter(s => getIndexMember(s) === indexFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(s => s.ticker.toLowerCase().includes(q) || getCompany(s).toLowerCase().includes(q))
    }
    if (mode === 'by-momentum' && momFilter) {
      const [lo, hi] = momFilter.split('-').map(Number)
      data = data.filter(s => {
        const sc = s.mom_score ?? 0
        return sc >= lo && sc < hi
      })
    }
    return data
  }, [stockData, indexFilter, search, mode, momFilter])

  const sorted = useMemo(() => {
    if (mode === 'by-return') {
      const field = returnField[returnWindow]
      return [...filtered].sort((a, b) => ((b[field] as number) ?? -Infinity) - ((a[field] as number) ?? -Infinity))
    }
    if (mode === 'by-momentum') {
      return [...filtered].sort((a, b) => ((b.mom_score ?? 0) - (a.mom_score ?? 0)))
    }
    return filtered
  }, [filtered, mode, returnWindow])

  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  const fmtPct = (v: number | null | undefined) =>
    v == null ? '—' : <span className={v >= 0 ? 'text-green-600' : 'text-red-500'}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>

  const rowBg = (rank: number, total: number) => {
    const pct = rank / total
    if (pct < 0.1) return 'bg-green-50 dark:bg-green-900/10'
    if (pct > 0.9) return 'bg-red-50 dark:bg-red-900/10'
    return ''
  }

const modeBtnCls = (m: Mode) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">個股排名</h1>

      {/* Mode tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button className={modeBtnCls('by-sub')} onClick={() => setMode('by-sub')}>依 Sub-industry 分類</button>
        <button className={modeBtnCls('by-return')} onClick={() => { setMode('by-return'); setPage(0) }}>依報酬排名</button>
        <button className={modeBtnCls('by-momentum')} onClick={() => { setMode('by-momentum'); setPage(0) }}>依動能排名</button>
      </div>

      {/* Mode 1: by sub — individual stock heatmap tiles */}
      {mode === 'by-sub' && (
        <div className="-mx-4 -mb-4">
          <StockHeatmap entries={heatmapEntries} date={heatmapDate} />
        </div>
      )}

      {/* Mode 2 & 3: ranked tables */}
      {(mode === 'by-return' || mode === 'by-momentum') && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            {mode === 'by-return' && (
              <div className="flex gap-1">
                {(['1w','1m','3m','6m'] as ReturnWindow[]).map(w => (
                  <button key={w} onClick={() => { setReturnWindow(w); setPage(0) }}
                    className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${returnWindow === w ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                    {w.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            {mode === 'by-momentum' && (
              <div className="flex gap-1">
                {[['後段','0-25'],['中低','25-50'],['中高','50-75'],['領先','75-100']].map(([label, range]) => (
                  <button key={range} onClick={() => { setMomFilter(momFilter === range ? null : range); setPage(0) }}
                    className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${momFilter === range ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                    {label} ({range})
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1">
              {(['all','SP500','SP400','SP600'] as IndexFilter[]).map(f => (
                <button key={f} onClick={() => { setIndexFilter(f); setPage(0) }}
                  className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${indexFilter === f ? 'bg-gray-700 dark:bg-gray-300 text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                  {f === 'all' ? '全部' : f}
                </button>
              ))}
            </div>
            <input
              type="text" placeholder="搜尋 Ticker / 公司名..."
              value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-white w-52"
            />
            <span className="text-sm text-gray-500">{sorted.length} 檔</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                <tr>
                  {mode === 'by-return'
                    ? ['#','Ticker','公司名','Sector','Sub-industry',`${returnWindow.toUpperCase()} 報酬`,'Mom Score'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">{h}</th>
                      ))
                    : ['#','Ticker','公司名','Sector','Sub-industry','Mom Score','1M 報酬','RVol'].map(h => (
                        <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">{h}</th>
                      ))
                  }
                </tr>
              </thead>
              <tbody>
                {pageData.map((s, i) => {
                  const globalRank = page * PAGE_SIZE + i
                  return (
                    <tr key={s.ticker} className={`border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 ${rowBg(globalRank, sorted.length)}`}>
                      <td className="px-3 py-2 text-gray-500 text-xs">{globalRank + 1}</td>
                      <td className="px-3 py-2"><Link href={`/stock/${s.ticker}`} className="text-blue-600 hover:underline font-medium">{s.ticker}</Link></td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[140px] truncate text-xs">{getCompany(s)}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs max-w-[100px] truncate">{getSector(s)}</td>
                      <td className="px-3 py-2 text-xs">
                        <Link href={`/sub/${s.gics_code}`} className="text-gray-600 dark:text-gray-400 hover:text-blue-600 hover:underline">{getSubIndustry(s)}</Link>
                      </td>
                      {mode === 'by-return' ? (
                        <>
                          <td className="px-3 py-2 font-mono text-sm">{fmtPct(s[returnField[returnWindow]] as number)}</td>
                          <td className="px-3 py-2 font-mono text-blue-600 text-sm">{s.mom_score?.toFixed(1) ?? '—'}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 font-mono text-blue-600 text-sm">{s.mom_score?.toFixed(1) ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-sm">{fmtPct(s.ret_1m)}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-sm">{s.rvol?.toFixed(2) ?? '—'}</td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3">
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
              className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-600">← 上一頁</button>
            <span className="text-sm text-gray-600 dark:text-gray-400">第 {page+1} / {totalPages} 頁</span>
            <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1}
              className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-600">下一頁 →</button>
          </div>
        </>
      )}
    </div>
  )
}
