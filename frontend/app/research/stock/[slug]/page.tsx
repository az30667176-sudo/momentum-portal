import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAllStockMemoSlugs, getStockMemo } from '@/lib/research'
import { StockMemoBody } from '@/components/StockMemoBody'

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return getAllStockMemoSlugs().map((slug) => ({ slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const memo = getStockMemo(params.slug)
  if (!memo) return { title: '個股想法 | Sector Pulse' }
  return { title: `${memo.ticker} · ${memo.title} | 個股想法` }
}

export default function StockMemoDetailPage({
  params,
}: {
  params: { slug: string }
}) {
  const memo = getStockMemo(params.slug)
  if (!memo) notFound()

  return (
    <article>
      <Link
        href="/research/stock"
        className="inline-flex items-center text-sm text-blue-600 hover:underline mb-4"
      >
        ← 回到個股想法列表
      </Link>

      <header className="mb-8 pb-6 border-b border-gray-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="rounded bg-blue-50 border border-blue-200 px-3 py-1.5 text-sm font-bold text-blue-700">
            {memo.ticker}
          </div>
          <div className="text-xs uppercase tracking-wider text-gray-500">
            {memo.sector} · {memo.subIndustry}
          </div>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-black leading-tight">
          {memo.title}
        </h1>
        <p className="mt-3 text-base text-gray-700 leading-7">{memo.subtitle}</p>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <Stat label="立場" value={memo.stance} />
          <Stat label="預期報酬" value={memo.expectedReturn} />
          <Stat label="信心" value={memo.conviction} />
          <Stat label="Mom Score" value={memo.momScore.toFixed(1)} />
          <Stat label="Sub Rank" value={memo.subRank} />
        </div>

        <p className="mt-4 text-xs text-gray-500">
          {memo.company} · 量化快照日 {memo.date}
        </p>
      </header>

      <StockMemoBody markdown={memo.body} />

      <footer className="mt-16 pt-6 border-t border-gray-200 text-xs text-gray-400">
        本文為基於 Sector Pulse 量化訊號 + 公開資料的研究紀錄,不構成任何投資建議。所有量化數據截至 {memo.date}。
      </footer>
    </article>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-black">{value}</div>
    </div>
  )
}
