import Link from 'next/link'
import { getAllStockMemos } from '@/lib/research'

export const dynamic = 'force-static'
export const metadata = { title: '個股想法 | 研究分享 | Sector Pulse' }

export default function StockMemoListPage() {
  const memos = getAllStockMemos()

  if (memos.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        <p className="text-lg">敬請期待</p>
        <p className="mt-2 text-sm">個股深度分析將會放在這裡。</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-200">
      {memos.map((m) => (
        <li key={m.slug} className="py-6">
          <Link href={`/research/stock/${m.slug}`} className="block group">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 rounded bg-blue-50 border border-blue-200 px-3 py-1.5 text-sm font-bold text-blue-700">
                {m.ticker}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-black leading-snug group-hover:text-blue-600 transition-colors">
                  {m.title}
                </h2>
                <p className="mt-1 text-sm text-gray-700 leading-6">
                  {m.company} · {m.subIndustry}
                </p>
                <p className="mt-2 text-sm text-gray-700 leading-6 line-clamp-2">
                  {m.subtitle}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 uppercase tracking-wider">
                  <span>{formatDate(m.date)}</span>
                  <span>立場 {m.stance}</span>
                  <span>預期 {m.expectedReturn}</span>
                  <span>信心 {m.conviction}</span>
                  <span>Mom {m.momScore.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function formatDate(d: string) {
  const dt = new Date(d + 'T00:00:00Z')
  const month = dt
    .toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    .toUpperCase()
  const day = dt.getUTCDate()
  const year = dt.getUTCFullYear()
  return `${month} ${day}, ${year}`
}
