import Link from 'next/link'
import Image from 'next/image'
import { getAllIssues } from '@/lib/weekly'

export const dynamic = 'force-static'
export const metadata = { title: '輪動週報 | Momentum Portal' }

export default function WeeklyListPage() {
  const issues = getAllIssues()

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 bg-white text-black min-h-screen">
      <header className="mb-8 pb-6 border-b border-gray-200">
        <div className="text-xs uppercase tracking-wider text-blue-600 font-semibold mb-2">
          Momentum Portal · Weekly Rotation
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-black leading-tight">
          輪動週報
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          每週一篇結合 portal 量化訊號 + 公開新聞的板塊輪動分析。
        </p>
      </header>

      {issues.length === 0 ? (
        <p className="text-gray-500 italic">尚未有任何期數。</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {issues.map((issue) => (
            <li key={issue.slug} className="py-6">
              <Link
                href={`/weekly/${issue.slug}`}
                className="flex gap-4 sm:gap-6 group"
              >
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold text-black leading-snug group-hover:text-blue-600 transition-colors">
                    第 {issue.issue} 期 · {issue.title}
                  </h2>
                  <p className="mt-2 text-sm text-gray-700 leading-6 line-clamp-2">
                    {issue.subtitle}
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                    <span className="uppercase tracking-wider">
                      {formatDate(issue.date)}
                    </span>
                    <span>·</span>
                    <span>KP@FOMOSOC</span>
                  </div>
                </div>
                <div className="flex-shrink-0 w-24 sm:w-36">
                  <div className="aspect-[4/3] rounded border border-gray-200 overflow-hidden bg-white">
                    <Image
                      src={`${issue.imageDir}/${issue.coverImage}`}
                      alt={issue.title}
                      width={400}
                      height={300}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function formatDate(d: string) {
  // 2026-04-03 → APR 3
  const dt = new Date(d + 'T00:00:00Z')
  const month = dt
    .toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    .toUpperCase()
  const day = dt.getUTCDate()
  return `${month} ${day}`
}
