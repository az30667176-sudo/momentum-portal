import Link from 'next/link'
import Image from 'next/image'
import { getAllReportListItems } from '@/lib/research'

export const dynamic = 'force-static'
export const metadata = { title: '輪動報告 | 研究分享 | Sector Pulse' }

export default function WeeklyListPage() {
  const items = getAllReportListItems()

  if (items.length === 0) {
    return <p className="text-gray-500 italic py-12">尚未有任何期數。</p>
  }

  return (
    <ul className="divide-y divide-gray-200">
      {items.map((item) => (
        <li key={`${item.type}-${item.slug}`} className="py-6">
          <Link
            href={`/research/weekly/${item.slug}`}
            className="flex gap-4 sm:gap-6 group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                    item.type === 'weekly'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {item.type === 'weekly' ? '週報' : '日報'}
                </span>
                {item.type === 'daily' && item.marketSentiment && (
                  <SentimentBadge sentiment={item.marketSentiment} />
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-black leading-snug group-hover:text-emerald-600 transition-colors">
                {item.type === 'weekly'
                  ? `週報第${item.issue}期 (${formatDateSlash(item.date)})`
                  : `日報 (${formatDateSlash(item.date)})`}
              </h2>
              <p className="mt-1 text-base font-semibold text-gray-800">
                {item.title}
              </p>
              {item.subtitle && (
                <p className="mt-2 text-sm text-gray-700 leading-6 line-clamp-2">
                  {item.subtitle}
                </p>
              )}
              <div className="mt-3 text-xs text-gray-500 uppercase tracking-wider">
                {formatDate(item.date)}
              </div>
            </div>
            {item.type === 'weekly' && item.coverImage && item.imageDir && (
              <div className="flex-shrink-0 w-24 sm:w-36">
                <div className="aspect-[4/3] rounded border border-gray-200 overflow-hidden bg-white">
                  <Image
                    src={`${item.imageDir}/${item.coverImage}`}
                    alt={item.title}
                    width={400}
                    height={300}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const styles: Record<string, string> = {
    'risk-on': 'bg-green-100 text-green-700',
    'risk-off': 'bg-red-100 text-red-700',
    neutral: 'bg-gray-100 text-gray-700',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        styles[sentiment] || styles.neutral
      }`}
    >
      {sentiment}
    </span>
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

function formatDateSlash(d: string) {
  const dt = new Date(d + 'T00:00:00Z')
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${mm}/${dd}/${dt.getUTCFullYear()}`
}
