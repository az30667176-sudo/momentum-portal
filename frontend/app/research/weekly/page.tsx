import Link from 'next/link'
import Image from 'next/image'
import { getAllIssues } from '@/lib/research'

export const dynamic = 'force-static'
export const metadata = { title: '輪動週報 | 研究分享 | Sector Pulse' }

export default function WeeklyListPage() {
  const issues = getAllIssues('weekly')

  if (issues.length === 0) {
    return <p className="text-gray-500 italic py-12">尚未有任何期數。</p>
  }

  return (
    <ul className="divide-y divide-gray-200">
      {issues.map((issue) => (
        <li key={issue.slug} className="py-6">
          <Link
            href={`/research/weekly/${issue.slug}`}
            className="flex gap-4 sm:gap-6 group"
          >
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-black leading-snug group-hover:text-emerald-600 transition-colors">
                第 {issue.issue} 期 · {issue.title}
              </h2>
              <p className="mt-2 text-sm text-gray-700 leading-6 line-clamp-2">
                {issue.subtitle}
              </p>
              <div className="mt-3 text-xs text-gray-500 uppercase tracking-wider">
                {formatDate(issue.date)}
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
