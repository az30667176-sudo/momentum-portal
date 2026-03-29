'use client'
import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { SubReturn, StockReturn, StockHeatmapEntry } from '@/lib/types'
import { StockHeatmap } from '@/components/StockHeatmap'

type Mode = 'by-sub' | 'by-return' | 'by-momentum'
type ReturnWindow = '1w' | '1m' | '3m' | '6m' | '1y'
type IndexFilter = 'all' | 'SP500' | 'SP400' | 'SP600'
type MomQuartile = '0' | '1' | '2' | '3'  // 0=後段, 1=中低, 2=中高, 3=領先

interface Props {
  subData: SubReturn[]
  stockData: StockReturn[]  // includes nested stock_universe and gics_universe from join
  heatmapEntries?: StockHeatmapEntry[]
  heatmapDate?: string | null
}

// Get a return value including fields not in the TS type but present in DB data
function getRetVal(s: StockReturn, w: ReturnWindow): number | null {
  if (w === '1w') return s.ret_1w
  if (w === '1m') return s.ret_1m
  if (w === '3m') return s.ret_3m
  if (w === '6m') return (s as any).ret_6m ?? null
  if (w === '1y') return (s as any).ret_12m ?? null
  return null
}

export function StockRanking({ subData, stockData, heatmapEntries = [], heatmapDate = null }: Props) {
  const [mode, setMode] = useState<Mode>('by-sub')
  const [returnWindow, setReturnWindow] = useState<ReturnWindow>('1m')
  const [indexFilter, setIndexFilter] = useState<IndexFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [momQuartile, setMomQuartile] = useState<MomQuartile | null>(null)
  const PAGE_SIZE = 50

  // Helper to get nested values from joined data
  const getCompany = (s: StockReturn) => (s as any).stock_universe?.company ?? ''
  const getIndexMember = (s: StockReturn) => (s as any).stock_universe?.index_member ?? ''
  const getSector = (s: StockReturn) => (s as any).gics_universe?.sector ?? ''
  const getSubIndustry = (s: StockReturn) => (s as any).gics_universe?.sub_industry ?? ''

  // Compute percentile boundaries (p25, p50, p75) from actual mom_score distribution
  const momThresholds = useMemo(() => {
    const scores = stockData
      .map(s => s.mom_score)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b)
    if (scores.length < 4) return null
    const n = scores.length
    return {
      p25: scores[Math.floor(n * 0.25)],
      p50: scores[Math.floor(n * 0.50)],
      p75: scores[Math.floor(n * 0.75)],
      min: scores[0],
      max: scores[n - 1],
    }
  }, [stockData])

  const filtered = useMemo(() => {
    let data = stockData
    if (indexFilter !== 'all') data = data.filter(s => getIndexMember(s) === indexFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(s => s.ticker.toLowerCase().includes(q) || getCompany(s).toLowerCase().includes(q))
    }
    if (mode === 'by-momentum' && momQuartile !== null && momThresholds) {
      const { p25, p50, p75, max } = momThresholds
      data = data.filter(s => {
        if (s.mom_score == null) return false
        const sc = s.mom_score
        if (momQuartile === '0') return sc < p25
        if (momQuartile === '1') return sc >= p25 && sc < p50
        if (momQuartile === '2') return sc >= p50 && sc < p75
        if (momQuartile === '3') return sc >= p75
        return true
      })
    }
    return data
  }, [stockData, indexFilter, search, mode, momQuartile, momThresholds])

  const sorted = useMemo(() => {
    if (mode === 'by-return') {
      return [...filtered].sort((a, b) => {
        const av = getRetVal(a, returnWindow) ?? -Infinity
        const bv = getRetVal(b, returnWindow) ?? -Infinity
        return bv - av
      })
    }
    if (mode === 'by-momentum') {
      return [...filtered].sort((a, b) => ((b.mom_score ?? -Infinity) - (a.mom_score ?? -Infinity)))
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

  const momQuartileLabels: { q: MomQuartile; label: string; range: string }[] = momThresholds ? [
    { q: '0', label: '後段', range: `< ${momThresholds.p25.toFixed(0)}` },
    { q: '1', label: '中低', range: `${momThresholds.p25.toFixed(0)}–${momThresholds.p50.toFixed(0)}` },
    { q: '2', label: '中高', range: `${momThresholds.p50.toFixed(0)}–${momThresholds.p75.toFixed(0)}` },
    { q: '3', label: '領先', range: `≥ ${momThresholds.p75.toFixed(0)}` },
  ] : [
    { q: '0', label: '後段', range: '0–25' },
    { q: '1', label: '中低', range: '25–50' },
    { q: '2', label: '中高', range: '50–75' },
    { q: '3', label: '領先', range: '75–100' },
  ]

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
                {(['1w','1m','3m','6m','1y'] as ReturnWindow[]).map(w => (
                  <button key={w} onClick={() => { setReturnWindow(w); setPage(0) }}
                    className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${returnWindow === w ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                    {w.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
            {mode === 'by-momentum' && (
              <div className="flex gap-1">
                {momQuartileLabels.map(({ q, label, range }) => (
                  <button key={q} onClick={() => { setMomQuartile(momQuartile === q ? null : q); setPage(0) }}
                    className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${momQuartile === q ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
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
                          <td className="px-3 py-2 font-mono text-sm">{fmtPct(getRetVal(s, returnWindow))}</td>
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
