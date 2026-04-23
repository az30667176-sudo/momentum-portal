import Image from 'next/image'
import Link from 'next/link'
import dynamicImport from 'next/dynamic'
import { notFound } from 'next/navigation'
import {
  getAllWeeklyAndDailySlugs,
  getIssue,
  getDailyReport,
} from '@/lib/research'
import type { DailyReport, DailyTopSector, DailyWarningSector, DailyFiveDayTrend } from '@/lib/research'
import { Inline } from '@/components/WeeklyMarkdown'

const ExhibitChart = dynamicImport(() => import('@/components/ExhibitChart'), {
  ssr: false,
  loading: () => <div className="h-[500px] bg-gray-50 rounded-lg animate-pulse" />,
})

export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return getAllWeeklyAndDailySlugs().map((slug) => ({ slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const daily = getDailyReport(params.slug)
  if (daily) {
    return { title: `日報 · ${daily.title} | 輪動報告` }
  }
  const issue = getIssue('weekly', params.slug)
  if (!issue) return { title: '輪動報告 | Sector Pulse' }
  return {
    title: `週報第${issue.issue}期 · ${issue.title} | 輪動報告`,
  }
}

export default function DetailPage({
  params,
}: {
  params: { slug: string }
}) {
  const daily = getDailyReport(params.slug)
  if (daily) return <DailyDetailView report={daily} />

  const issue = getIssue('weekly', params.slug)
  if (!issue) notFound()

  return (
    <article>
      <Link
        href="/research/weekly"
        className="inline-flex items-center text-sm text-emerald-600 hover:underline mb-4"
      >
        ← 回到輪動報告列表
      </Link>

      <header className="mb-10 pb-6 border-b border-gray-200">
        <div className="text-xs uppercase tracking-wider text-emerald-600 font-semibold mb-2">
          週報第{issue.issue}期
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

/* ================================================================
   Daily Report Template
   ================================================================ */

function DailyDetailView({ report }: { report: DailyReport }) {
  const trendMap = new Map(report.fiveDayTrend.map((t) => [t.gicsCode, t]))

  return (
    <article>
      <Link
        href="/research/weekly"
        className="inline-flex items-center text-sm text-emerald-600 hover:underline mb-4"
      >
        ← 回到輪動報告列表
      </Link>

      <header className="mb-10 pb-6 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs uppercase tracking-wider text-blue-600 font-semibold">日報</span>
          <SentimentBadge sentiment={report.marketSentiment} />
          <span className="text-xs text-gray-500">
            SPY {report.spyReturn > 0 ? '+' : ''}{report.spyReturn.toFixed(2)}%
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-black leading-tight">
          {report.title}
        </h1>
        <p className="mt-3 text-sm text-gray-500">{report.date}</p>
      </header>

      {/* Section 1 */}
      <section>
        <H2>今日市場定調</H2>
        <P><Inline text={report.intro} /></P>
      </section>

      {/* Section 2 */}
      <section>
        <H2>動能領先板塊</H2>
        <div className="mt-4 space-y-6">
          {report.topSectors.map((s) => (
            <TopSectorCard key={s.gicsCode} sector={s} trend={trendMap.get(s.gicsCode)} />
          ))}
        </div>
      </section>

      {/* Section 3 */}
      {report.warningSectors.length > 0 && (
        <section>
          <H2>動能警示板塊</H2>
          <div className="mt-4 space-y-4">
            {report.warningSectors.map((s) => (
              <WarningSectorCard key={s.gicsCode} sector={s} trend={trendMap.get(s.gicsCode)} />
            ))}
          </div>
        </section>
      )}

      {/* Section 5 */}
      <section>
        <H2>今日結論</H2>
        <P><Inline text={report.conclusion} /></P>
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-700 mb-1">延續性總評</p>
          <p className="text-sm text-black">{report.continuityAssessment}</p>
        </div>
        {report.tomorrowWatch.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-semibold text-gray-700 mb-2">明日觀察重點</p>
            <ul className="space-y-1 text-sm text-black list-disc list-outside pl-5">
              {report.tomorrowWatch.map((w, i) => (
                <li key={i}><Inline text={w} /></li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <H2>新聞來源</H2>
      <ul className="mt-4 space-y-2 text-sm text-gray-600 list-disc list-outside pl-6">
        {report.sources.map((s, i) => (
          <li key={i}>
            <a className="text-emerald-600 hover:underline" href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>
          </li>
        ))}
      </ul>

      <footer className="mt-16 pt-6 border-t border-gray-200 text-xs text-gray-400">
        本文僅為基於 Sector Pulse 量化訊號 +
        公開新聞所做的盤後研究筆記，不構成任何投資建議。所有數據截至 {report.date}。
      </footer>
    </article>
  )
}

/* ---- Sub-components ---- */

function TopSectorCard({ sector, trend }: { sector: DailyTopSector; trend?: DailyFiveDayTrend }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center justify-between mb-3">
        <Link
          href={`/sub/${sector.gicsCode}`}
          className="text-lg font-bold text-black hover:text-emerald-600 transition-colors"
        >
          {sector.name}
        </Link>
        <ContinuityBadge level={sector.continuity} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Indicator label="Mom Score" value={sector.momScore.toFixed(1)} />
        <Indicator label="ΔRank" value={`${sector.deltaRank > 0 ? '+' : ''}${sector.deltaRank}`} />
        <Indicator label="CMF" value={sector.cmf.toFixed(2)} />
        <Indicator label="Autocorr" value={sector.autocorr.toFixed(2)} />
      </div>
      <p className="text-sm text-black leading-6 mb-2"><Inline text={sector.analysis} /></p>
      {sector.news && (
        <p className="text-sm text-gray-600 leading-6 mb-3"><Inline text={sector.news} /></p>
      )}
      {trend && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">近日比較</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-1.5 pr-3 text-xs text-gray-500 font-medium">指標</th>
                  {trend.days.map((d) => (
                    <th key={d} className="text-center py-1.5 px-2 text-xs text-gray-500 font-medium">{d.slice(5)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TrendRow label="Mom Score" values={trend.momScore} format={(v) => v.toFixed(1)} />
                <TrendRow label="CMF" values={trend.cmf} format={(v) => v.toFixed(2)} />
                <TrendRow label="ΔRank" values={trend.deltaRank} format={(v) => `${v > 0 ? '+' : ''}${v}`} />
                <TrendRow label="RVol" values={trend.rvol} format={(v) => v.toFixed(2)} />
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-xs text-gray-600 leading-5"><Inline text={trend.interpretation} /></p>
        </div>
      )}
      {sector.focusStocks.length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">個股聚焦</p>
          <div className="space-y-1">
            {sector.focusStocks.map((stock) => (
              <div key={stock.ticker} className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-emerald-700">{stock.ticker}</span>
                <span className="text-gray-600">
                  Mom {stock.momScore.toFixed(1)} · 1D {stock.ret1d > 0 ? '+' : ''}{stock.ret1d.toFixed(1)}%
                </span>
                <span className="text-gray-500 text-xs">{stock.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function WarningSectorCard({ sector, trend }: { sector: DailyWarningSector; trend?: DailyFiveDayTrend }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-center justify-between mb-2">
        <Link
          href={`/sub/${sector.gicsCode}`}
          className="text-lg font-bold text-black hover:text-red-600 transition-colors"
        >
          {sector.name}
        </Link>
        <span className="text-xs font-medium text-red-600">連{sector.consecutiveDays}日惡化</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <Indicator label="Momentum Decay" value={`${sector.momentumDecay.toFixed(1)}%`} warn />
        <Indicator label="ΔRank" value={`${sector.deltaRank > 0 ? '+' : ''}${sector.deltaRank}`} warn />
      </div>
      <p className="text-sm text-black leading-6 mb-1"><Inline text={sector.reason} /></p>
      {sector.news && (
        <p className="text-sm text-gray-600 leading-6 mb-1"><Inline text={sector.news} /></p>
      )}
      {trend && (
        <div className="mt-3 border-t border-red-200 pt-3">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-2">近日比較</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-red-200">
                  <th className="text-left py-1.5 pr-3 text-xs text-gray-500 font-medium">指標</th>
                  {trend.days.map((d) => (
                    <th key={d} className="text-center py-1.5 px-2 text-xs text-gray-500 font-medium">{d.slice(5)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TrendRow label="Mom Score" values={trend.momScore} format={(v) => v.toFixed(1)} />
                <TrendRow label="CMF" values={trend.cmf} format={(v) => v.toFixed(2)} />
                <TrendRow label="ΔRank" values={trend.deltaRank} format={(v) => `${v > 0 ? '+' : ''}${v}`} />
                <TrendRow label="RVol" values={trend.rvol} format={(v) => v.toFixed(2)} />
              </tbody>
            </table>
          </div>
          <p className="mt-1.5 text-xs text-gray-600 leading-5"><Inline text={trend.interpretation} /></p>
        </div>
      )}
      <p className="text-sm font-semibold text-red-700 mt-2">
        操作含義：<Inline text={sector.action} />
      </p>
    </div>
  )
}

function FiveDayTable({ trend }: { trend: DailyFiveDayTrend }) {
  return (
    <div>
      <Link
        href={`/sub/${trend.gicsCode}`}
        className="text-base font-bold text-black hover:text-emerald-600 transition-colors"
      >
        {trend.name}
      </Link>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="text-left py-2 pr-3 text-xs text-gray-500 font-medium">指標</th>
              {trend.days.map((d) => (
                <th key={d} className="text-center py-2 px-2 text-xs text-gray-500 font-medium">
                  {d.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <TrendRow label="Mom Score" values={trend.momScore} format={(v) => v.toFixed(1)} />
            <TrendRow label="CMF" values={trend.cmf} format={(v) => v.toFixed(2)} />
            <TrendRow label="ΔRank" values={trend.deltaRank} format={(v) => `${v > 0 ? '+' : ''}${v}`} />
            <TrendRow label="RVol" values={trend.rvol} format={(v) => v.toFixed(2)} />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-gray-700 leading-6"><Inline text={trend.interpretation} /></p>
    </div>
  )
}

function TrendRow({ label, values, format }: { label: string; values: number[]; format: (v: number) => string }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="py-1.5 pr-3 text-xs font-medium text-gray-600">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="text-center py-1.5 px-2 text-xs text-black font-mono">{format(v)}</td>
      ))}
    </tr>
  )
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const styles: Record<string, string> = {
    'risk-on': 'bg-green-100 text-green-700',
    'risk-off': 'bg-red-100 text-red-700',
    neutral: 'bg-gray-100 text-gray-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${styles[sentiment] || styles.neutral}`}>
      {sentiment}
    </span>
  )
}

function ContinuityBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    strong: 'bg-green-100 text-green-700',
    watch: 'bg-yellow-100 text-yellow-700',
    noise: 'bg-gray-100 text-gray-500',
  }
  const labels: Record<string, string> = {
    strong: '延續性強',
    watch: '觀察中',
    noise: '訊號不穩',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${styles[level] || styles.noise}`}>
      {labels[level] || level}
    </span>
  )
}

function Indicator({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded border px-3 py-2 ${warn ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
      <div className="text-[10px] uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${warn ? 'text-red-700' : 'text-black'}`}>{value}</div>
    </div>
  )
}

/* ---- Shared helpers ---- */

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
