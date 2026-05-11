'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { NotableStocksResult, NotableStock, ReversalStock } from '@/lib/notableStocks'

type SortCol = 'return' | 'diff' | 'z' | 'mom' | 'rvol' | 'notability'
type SortDir = 'asc' | 'desc'

interface Props {
  dailyData: NotableStocksResult
  weeklyData: NotableStocksResult
}

const BADGE_STYLES: Record<string, string> = {
  'Top Gainer': 'bg-green-100 text-green-800 border-green-300',
  'Top Loser': 'bg-red-100 text-red-800 border-red-300',
  'Strong Outperformer': 'bg-green-50 text-green-700 border-green-400',
  'Strong Underperformer': 'bg-red-50 text-red-700 border-red-400',
  'Industry Outlier – Positive': 'bg-blue-100 text-blue-800 border-blue-300',
  'Industry Outlier – Negative': 'bg-orange-100 text-orange-800 border-orange-300',
}

const BADGE_SHORT: Record<string, string> = {
  'Top Gainer': '漲幅前列',
  'Top Loser': '跌幅前列',
  'Strong Outperformer': '強勢領先',
  'Strong Underperformer': '弱勢落後',
  'Industry Outlier – Positive': '逆勢上漲',
  'Industry Outlier – Negative': '逆勢下跌',
}

function Badge({ type }: { type: string }) {
  const cls = BADGE_STYLES[type] ?? 'bg-gray-100 text-gray-700 border-gray-300'
  const label = BADGE_SHORT[type] ?? type
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium border rounded ${cls}`}>
      {label}
    </span>
  )
}

function fmtPct(v: number | null | undefined) {
  if (v == null) return <span className="text-gray-300">—</span>
  const sign = v >= 0 ? '+' : ''
  const color = v >= 0 ? 'text-green-600' : 'text-red-500'
  return <span className={color}>{sign}{v.toFixed(2)}%</span>
}

function fmtNum(v: number | null | undefined, decimals = 1) {
  if (v == null) return <span className="text-gray-300">—</span>
  return <span>{v.toFixed(decimals)}</span>
}

function getSortVal(s: NotableStock, col: SortCol): number {
  switch (col) {
    case 'return': return s.return_pct
    case 'diff': return s.diff_vs_industry
    case 'z': return Math.abs(s.z_score)
    case 'mom': return s.mom_score ?? -999
    case 'rvol': return s.rvol ?? -999
    case 'notability': return s.notability_score
  }
}

function StockTable({
  stocks,
  title,
  showZScore = false,
}: {
  stocks: NotableStock[]
  title: string
  showZScore?: boolean
}) {
  const [sortCol, setSortCol] = useState<SortCol>('return')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const sorted = useMemo(() => {
    return [...stocks].sort((a, b) => {
      const av = getSortVal(a, sortCol)
      const bv = getSortVal(b, sortCol)
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [stocks, sortCol, sortDir])

  const ColHeader = ({ col, label }: { col: SortCol; label: string }) => (
    <th
      className="px-2 py-2 text-left text-xs font-medium text-gray-600 cursor-pointer select-none hover:text-emerald-600 whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      {label}{' '}
      <span className="text-gray-400">
        {sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
      </span>
    </th>
  )

  if (stocks.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="text-base font-bold text-black mb-2">{title}</h3>
        <p className="text-sm text-gray-500">無資料</p>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <h3 className="text-base font-bold text-black mb-2">{title}</h3>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap">Ticker</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap hidden sm:table-cell">公司</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap hidden md:table-cell">板塊</th>
              <ColHeader col="return" label="報酬" />
              <ColHeader col="diff" label="vs 產業" />
              {showZScore && <ColHeader col="z" label="|Z|" />}
              <ColHeader col="mom" label="Mom" />
              <ColHeader col="rvol" label="RVol" />
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap">標籤</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => (
              <tr key={s.ticker} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-2 py-2 whitespace-nowrap">
                  <Link
                    href={`/stock/${s.ticker}`}
                    className="font-semibold text-emerald-700 hover:text-emerald-500"
                  >
                    {s.ticker}
                  </Link>
                </td>
                <td className="px-2 py-2 text-gray-700 whitespace-nowrap hidden sm:table-cell max-w-[140px] truncate" title={s.company}>
                  {s.company}
                </td>
                <td className="px-2 py-2 text-gray-500 whitespace-nowrap hidden md:table-cell max-w-[160px] truncate" title={s.sub_industry}>
                  {s.sub_industry}
                </td>
                <td className="px-2 py-2 whitespace-nowrap font-medium">{fmtPct(s.return_pct)}</td>
                <td className="px-2 py-2 whitespace-nowrap">{fmtPct(s.diff_vs_industry)}</td>
                {showZScore && (
                  <td className="px-2 py-2 whitespace-nowrap text-gray-700">
                    {fmtNum(Math.abs(s.z_score), 1)}
                  </td>
                )}
                <td className="px-2 py-2 whitespace-nowrap text-gray-700">{fmtNum(s.mom_score)}</td>
                <td className="px-2 py-2 whitespace-nowrap text-gray-700">{fmtNum(s.rvol, 2)}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    {s.abnormal_types.map((t) => <Badge key={t} type={t} />)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const REVERSAL_BADGE: Record<string, { label: string; cls: string }> = {
  'Rally Reversal': { label: '漲多回落', cls: 'bg-red-100 text-red-800 border-red-300' },
  'Decline Reversal': { label: '跌深反彈', cls: 'bg-green-100 text-green-800 border-green-300' },
}

function ReversalTable({ stocks }: { stocks: ReversalStock[] }) {
  type RCol = 'today' | 'prior' | 'score' | 'mom' | 'rvol'
  const [sortCol, setSortCol] = useState<RCol>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (col: RCol) => {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const sorted = useMemo(() => {
    return [...stocks].sort((a, b) => {
      let av: number, bv: number
      switch (sortCol) {
        case 'today': av = Math.abs(a.today_return_pct); bv = Math.abs(b.today_return_pct); break
        case 'prior': av = Math.abs(a.prior_return_pct); bv = Math.abs(b.prior_return_pct); break
        case 'score': av = a.reversal_score; bv = b.reversal_score; break
        case 'mom': av = a.mom_score ?? -999; bv = b.mom_score ?? -999; break
        case 'rvol': av = a.rvol ?? -999; bv = b.rvol ?? -999; break
      }
      return sortDir === 'desc' ? bv - av : av - bv
    })
  }, [stocks, sortCol, sortDir])

  const ColHeader = ({ col, label }: { col: RCol; label: string }) => (
    <th
      className="px-2 py-2 text-left text-xs font-medium text-gray-600 cursor-pointer select-none hover:text-emerald-600 whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      {label}{' '}
      <span className="text-gray-400">
        {sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}
      </span>
    </th>
  )

  if (stocks.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="text-base font-bold text-black mb-2">動能反轉股</h3>
        <p className="text-sm text-gray-500">今日無符合條件的反轉股</p>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <h3 className="text-base font-bold text-black mb-1">動能反轉股</h3>
      <p className="text-xs text-gray-500 mb-2">前 4 日累計漲/跌 &ge;3%，今日反轉 &ge;3%</p>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap">Ticker</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap hidden sm:table-cell">公司</th>
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap hidden md:table-cell">板塊</th>
              <ColHeader col="prior" label="前4日" />
              <ColHeader col="today" label="今日" />
              <ColHeader col="score" label="反轉強度" />
              <ColHeader col="mom" label="Mom" />
              <ColHeader col="rvol" label="RVol" />
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 whitespace-nowrap">類型</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const badge = REVERSAL_BADGE[s.reversal_type] ?? { label: s.reversal_type, cls: 'bg-gray-100 text-gray-700 border-gray-300' }
              return (
                <tr key={s.ticker} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-2 py-2 whitespace-nowrap">
                    <Link href={`/stock/${s.ticker}`} className="font-semibold text-emerald-700 hover:text-emerald-500">
                      {s.ticker}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-gray-700 whitespace-nowrap hidden sm:table-cell max-w-[140px] truncate" title={s.company}>
                    {s.company}
                  </td>
                  <td className="px-2 py-2 text-gray-500 whitespace-nowrap hidden md:table-cell max-w-[160px] truncate" title={s.sub_industry}>
                    {s.sub_industry}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{fmtPct(s.prior_return_pct)}</td>
                  <td className="px-2 py-2 whitespace-nowrap font-medium">{fmtPct(s.today_return_pct)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-gray-700">{fmtNum(s.reversal_score)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-gray-700">{fmtNum(s.mom_score)}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-gray-700">{fmtNum(s.rvol, 2)}</td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium border rounded ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function NotableStocksView({ dailyData, weeklyData }: Props) {
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily')
  const data = mode === 'daily' ? dailyData : weeklyData

  const modeBtnCls = (m: 'daily' | 'weekly') =>
    `px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
      mode === m ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`

  const modeLabel = mode === 'daily' ? '日報酬' : '週報酬'
  const ms = data.market_summary

  return (
    <div className="bg-white text-black">
      {/* Mode tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button className={modeBtnCls('daily')} onClick={() => setMode('daily')}>每日</button>
        <button className={modeBtnCls('weekly')} onClick={() => setMode('weekly')}>每週</button>
        <span className="ml-auto text-xs text-gray-500">
          {data.date} · {data.total_stocks} 檔 · {modeLabel}
        </span>
      </div>

      {/* Market summary */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-700 mb-2 px-1">
        <span>中位數 <strong className={ms.median >= 0 ? 'text-green-600' : 'text-red-500'}>{ms.median >= 0 ? '+' : ''}{ms.median.toFixed(2)}%</strong></span>
        <span>平均 <strong className={ms.mean >= 0 ? 'text-green-600' : 'text-red-500'}>{ms.mean >= 0 ? '+' : ''}{ms.mean.toFixed(2)}%</strong></span>
        <span>上漲 <strong>{ms.positive_pct.toFixed(1)}%</strong></span>
        <span>異常股 <strong>{data.summary.total_flagged}</strong> 檔</span>
      </div>

      {/* Top gainers */}
      <StockTable stocks={data.top_gainers} title="漲幅最大" />

      {/* Top losers */}
      <StockTable stocks={data.top_losers} title="跌幅最大" />

      {/* Industry outliers */}
      <StockTable stocks={data.industry_outliers} title="產業異常股" showZScore />

      {/* Reversals */}
      <ReversalTable stocks={data.reversals} />

      {/* Sector summary */}
      {data.summary.sectors_with_most_outliers.length > 0 && (
        <div className="mt-6 text-sm text-gray-600">
          <h3 className="text-base font-bold text-black mb-2">異常股集中板塊</h3>
          <div className="flex flex-wrap gap-2">
            {data.summary.sectors_with_most_outliers.map(({ sector, count }) => (
              <span key={sector} className="px-2 py-1 bg-gray-100 rounded text-xs">
                {sector} <strong>{count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
