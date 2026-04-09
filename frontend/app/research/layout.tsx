import { ResearchSubNav } from '@/components/ResearchSubNav'

export default function ResearchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 bg-white text-black min-h-screen">
      <header className="mb-6 pb-4 border-b border-gray-200">
        <div className="text-xs uppercase tracking-wider text-emerald-600 font-semibold mb-2">
          Sector Pulse · Research
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-black leading-tight">
          研究分享
        </h1>
      </header>
      <ResearchSubNav />
      {children}
    </main>
  )
}
