import Link from 'next/link'
import { getLatestSubReturns, getLatestDate } from '@/lib/supabase'
import { getAllIssues } from '@/lib/research'
import { LogoIcon } from '@/components/Logo'

export const revalidate = 0

export default async function LandingPage() {
  const [subData, latestDate] = await Promise.all([
    getLatestSubReturns(),
    getLatestDate(),
  ])

  // top 5 subs by mom_score
  const top5 = subData
    .filter((s) => s.mom_score != null)
    .sort((a, b) => (b.mom_score ?? 0) - (a.mom_score ?? 0))
    .slice(0, 5)

  // latest weekly issue
  const weeklyIssues = getAllIssues('weekly')
  const latestWeekly = weeklyIssues.length > 0 ? weeklyIssues[0] : null

  // sector summary: average 1w return by sector
  const sectorMap: Record<string, { sum: number; n: number }> = {}
  for (const s of subData) {
    const sec = s.gics_universe?.sector
    if (!sec || s.ret_1w == null) continue
    if (!sectorMap[sec]) sectorMap[sec] = { sum: 0, n: 0 }
    sectorMap[sec].sum += s.ret_1w
    sectorMap[sec].n += 1
  }
  const sectorPerf = Object.entries(sectorMap)
    .map(([sector, { sum, n }]) => ({ sector, ret: sum / n }))
    .sort((a, b) => b.ret - a.ret)

  const maxAbsRet = Math.max(...sectorPerf.map(s => Math.abs(s.ret)), 1)

  return (
    <main className="min-h-screen bg-white">
      {/* Hero — 2-column on desktop */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.15) 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }} />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: text */}
            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight">
                S&P 1500 板塊輪動<br />量化研究平台
              </h1>
              <p className="mt-5 text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                每日追蹤 155 個 GICS Sub-Industry 的動能排名、成交量訊號與風險指標，
                結合 Sector Rotation 策略回測引擎，從板塊定位到個股篩選一站完成。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/sectors"
                  className="inline-flex items-center px-6 py-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  開始探索產業
                  <svg className="ml-2 w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </Link>
                <Link
                  href="/backtest"
                  className="inline-flex items-center px-6 py-3 rounded-lg bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors border border-white/20"
                >
                  策略回測
                </Link>
              </div>
              {latestDate && (
                <p className="mt-6 text-xs text-slate-500">
                  資料截至 {latestDate} · 每日美東收盤後自動更新
                </p>
              )}
            </div>

            {/* Right: live stats panel */}
            <div className="hidden lg:block">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-4">
                  即時板塊概覽
                </div>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <StatTile label="追蹤產業" value="155" />
                  <StatTile label="追蹤個股" value="1,500+" />
                  <StatTile label="回測歷史" value="3 年" />
                </div>
                <div className="space-y-2">
                  {sectorPerf.slice(0, 5).map(({ sector, ret }) => (
                    <div key={sector} className="flex items-center gap-3">
                      <span className="w-28 text-xs text-slate-300 truncate shrink-0">{sector}</span>
                      <div className="flex-1 h-4 bg-white/5 rounded-full relative overflow-hidden">
                        <div
                          className={`absolute top-0 h-full rounded-full ${ret >= 0 ? 'bg-emerald-500/70 left-1/2' : 'bg-red-400/70 right-1/2'}`}
                          style={{ width: `${Math.min((Math.abs(ret) / maxAbsRet) * 50, 50)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono w-14 text-right ${ret >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Spotlight — 3-column on desktop */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <h2 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Spotlight</h2>
        <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">本週焦點</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Weekly report card */}
          {latestWeekly && (
            <Link
              href={`/research/weekly/${latestWeekly.slug}`}
              className="group block rounded-xl border border-gray-200 bg-white p-6 hover:shadow-lg hover:border-emerald-200 transition-all"
            >
              <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">
                週報第{latestWeekly.issue}期
              </div>
              <h3 className="text-lg font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">
                {latestWeekly.title}
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed line-clamp-3">
                {latestWeekly.subtitle}
              </p>
              <div className="mt-4 text-xs text-gray-400">{latestWeekly.date}</div>
            </Link>
          )}

          {/* Top 5 subs */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">
              動能排名 Top 5 Sub-Industry
            </div>
            <div className="space-y-3 mt-3">
              {top5.map((s, i) => (
                <Link
                  key={s.gics_code}
                  href={`/sub/${s.gics_code}`}
                  className="flex items-center gap-3 group"
                >
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-xs font-bold text-slate-600 flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium text-gray-900 group-hover:text-emerald-600 transition-colors truncate">
                    {s.gics_universe?.sub_industry ?? s.gics_code}
                  </span>
                  <span className="text-xs font-semibold text-gray-500">
                    M:{(s.mom_score ?? 0).toFixed(0)}
                  </span>
                  <span className={`text-xs font-semibold ${(s.ret_1w ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {(s.ret_1w ?? 0) >= 0 ? '+' : ''}{(s.ret_1w ?? 0).toFixed(1)}%
                  </span>
                </Link>
              ))}
            </div>
            <Link href="/sectors" className="inline-block mt-4 text-xs text-emerald-600 hover:underline font-medium">
              查看完整 155 產業 →
            </Link>
          </div>

          {/* Quick stats / data highlights */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-4">
              平台數據
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="text-sm text-gray-500">覆蓋指數</span>
                <span className="text-sm font-semibold text-gray-900">S&P 500 / 400 / 600</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="text-sm text-gray-500">GICS 次產業</span>
                <span className="text-sm font-semibold text-gray-900">155 個</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="text-sm text-gray-500">追蹤個股</span>
                <span className="text-sm font-semibold text-gray-900">~1,500 檔</span>
              </div>
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <span className="text-sm text-gray-500">資料頻率</span>
                <span className="text-sm font-semibold text-gray-900">每日盤後更新</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">回測深度</span>
                <span className="text-sm font-semibold text-gray-900">3 年歷史</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 11 Sector performance — 2-column bar layout on desktop */}
      <section className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <h2 className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">Sector Performance</h2>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">11 大板塊本週表現</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-3">
            {sectorPerf.map(({ sector, ret }) => (
              <div key={sector} className="flex items-center gap-3">
                <span className="w-36 xl:w-44 text-sm font-medium text-gray-700 truncate shrink-0">{sector}</span>
                <div className="flex-1 h-6 bg-gray-200 rounded-full relative overflow-hidden">
                  <div
                    className={`absolute top-0 h-full rounded-full transition-all ${ret >= 0 ? 'bg-emerald-500 left-1/2' : 'bg-red-400 right-1/2'}`}
                    style={{ width: `${Math.min((Math.abs(ret) / maxAbsRet) * 50, 50)}%` }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700">
                    {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section links — 4-column on desktop */}
      <section className="border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">平台功能</h2>
          <p className="text-sm text-gray-500 mb-8">點擊任一張卡片直接前往</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            <SectionCard
              href="/sectors"
              icon={<GridIcon />}
              title="產業總覽"
              desc="155 格 Sub-Industry Heatmap，一眼掃完哪些板塊在領漲、哪些在掉隊。"
            />
            <SectionCard
              href="/stocks"
              icon={<RankIcon />}
              title="個股排名"
              desc="S&P 1500 全部個股的動能排名、報酬率、成交量強度，找到板塊裡最強的股票。"
            />
            <SectionCard
              href="/backtest"
              icon={<BacktestIcon />}
              title="回測專區"
              desc="自訂 Sector Rotation 策略，一鍵回測 3 年歷史，即時訊號掃描跟 Preset 管理。"
            />
            <SectionCard
              href="/research"
              icon={<ResearchIcon />}
              title="研究分享"
              desc="每週輪動觀察報告 + 個股深度 Memo，結合量化訊號與公開新聞的可追蹤研究。"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LogoIcon className="w-6 h-6" />
            <span className="text-sm font-semibold text-gray-700">Sector Pulse</span>
          </div>
          <p className="text-xs text-gray-400 text-center">
            本站所有資料僅供研究參考，不構成投資建議。資料來源：S&P 1500 公開市場數據。
          </p>
        </div>
      </footer>
    </main>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-[11px] text-slate-400 mt-1">{label}</div>
    </div>
  )
}

function SectionCard({ href, icon, title, desc }: { href: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 hover:shadow-lg hover:border-emerald-200 transition-all"
    >
      <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:bg-emerald-100 transition-colors mb-3">
        {icon}
      </div>
      <h3 className="text-base font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">{title}</h3>
      <p className="mt-1 text-sm text-gray-500 leading-relaxed">{desc}</p>
    </Link>
  )
}

function GridIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}
function RankIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  )
}
function BacktestIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}
function ResearchIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}
