import { getStockHeatmap } from '@/lib/supabase'
import { StockHeatmap } from '@/components/StockHeatmap'
import Link from 'next/link'

export const revalidate = 0

export default async function HomePage() {
  const { entries, date } = await getStockHeatmap()
  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="bg-gray-800 border-b border-gray-700 px-4 py-2 flex items-center gap-2">
        <span className="px-4 py-1.5 rounded text-sm font-medium bg-blue-600 text-white cursor-default">
          S&amp;P 1500 · 145 Sub-industries
        </span>
        <Link
          href="/backtest"
          className="px-4 py-1.5 rounded text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          回測專區 →
        </Link>
      </nav>
      <StockHeatmap entries={entries} date={date} />
    </div>
  )
}
