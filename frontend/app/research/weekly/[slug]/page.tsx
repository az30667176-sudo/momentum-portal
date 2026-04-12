import Image from 'next/image'
import Link from 'next/link'
import dynamicImport from 'next/dynamic'
import { notFound } from 'next/navigation'
import { getAllSlugs, getIssue } from '@/lib/research'
import { Inline } from '@/components/WeeklyMarkdown'

const ExhibitChart = dynamicImport(() => import('@/components/ExhibitChart'), {
  ssr: false,
  loading: () => <div className="h-[500px] bg-gray-50 rounded-lg animate-pulse" />,
})

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return getAllSlugs('weekly').map((slug) => ({ slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const issue = getIssue('weekly', params.slug)
  if (!issue) return { title: '輪動週報 | Sector Pulse' }
  return {
    title: `第 ${issue.issue} 期 · ${issue.title} | 輪動週報`,
  }
}

export default function WeeklyDetailPage({
  params,
}: {
  params: { slug: string }
}) {
  const issue = getIssue('weekly', params.slug)
  if (!issue) notFound()

  return (
    <article>
      <Link
        href="/research/weekly"
        className="inline-flex items-center text-sm text-emerald-600 hover:underline mb-4"
      >
        ← 回到輪動週報列表
      </Link>

      <header className="mb-10 pb-6 border-b border-gray-200">
        <div className="text-xs uppercase tracking-wider text-emerald-600 font-semibold mb-2">
          輪動週報 · 第 {issue.issue} 期
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-black leading-tight">
          {issue.title}
        </h1>
        <p className="mt-3 text-base text-gray-700 leading-7">
          {issue.subtitle}
        </p>
        <p className="mt-3 text-sm text-gray-500">
          截至 {issue.date} 當週 · 快照日 {issue.snapshotDate}
        </p>
      </header>

      <section>
        <H2>本期觀點</H2>
        {issue.intro.map((p, i) => (
          <P key={i}>
            <Inline text={p} />
          </P>
        ))}
      </section>

      {issue.exhibits.map((ex) => (
        <section key={ex.number}>
          <H2>
            圖{toCJKNumber(ex.number)}　{ex.title}
          </H2>
          <figure className="my-8">
            {ex.chartData ? (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden p-4">
                <ExhibitChart
                  chartData={ex.chartData}
                  title={`Exhibit ${ex.number} — ${ex.title}`}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <Image
                  src={`${issue.imageDir}/${ex.image}`}
                  alt={ex.title}
                  width={1400}
                  height={900}
                  className="w-full h-auto"
                  unoptimized
                />
              </div>
            )}
            <figcaption className="mt-2 text-sm text-gray-500 italic">
              {ex.caption}
            </figcaption>
            {ex.links && ex.links.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="text-xs text-gray-400 self-center mr-1">查看數據 →</span>
                {ex.links.map((link, li) => (
                  <Link
                    key={li}
                    href={link.href}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200"
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </figure>
          <P>
            <Inline text={ex.body} />
          </P>
        </section>
      ))}

      <H2>下一次 rebal 的具體動作</H2>
      <ol className="mt-4 space-y-3 text-[15px] leading-7 text-black list-decimal list-outside pl-6">
        {issue.actions.map((a, i) => (
          <li key={i}>
            <Inline text={a} />
          </li>
        ))}
      </ol>

      <H2>新聞來源</H2>
      <ul className="mt-4 space-y-2 text-sm text-gray-600 list-disc list-outside pl-6">
        {issue.sources.map((s, i) => (
          <li key={i}>
            <a
              className="text-emerald-600 hover:underline"
              href={s.url}
              target="_blank"
              rel="noreferrer"
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>

      <footer className="mt-16 pt-6 border-t border-gray-200 text-xs text-gray-400">
        本文僅為基於 Sector Pulse 量化訊號 +
        公開新聞所做的研究紀錄，不構成任何投資建議。所有數據截至 {issue.snapshotDate}。
      </footer>
    </article>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-12 mb-3 text-xl font-bold text-black border-l-4 border-emerald-600 pl-3">
      {children}
    </h2>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-4 leading-8 text-black text-[15px]">{children}</p>
  )
}

function toCJKNumber(n: number): string {
  const map = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  if (n <= 10) return map[n]
  return String(n)
}
