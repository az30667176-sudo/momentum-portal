import { getLatestSubReturns, getLatestStockReturns, getStockHeatmap } from '@/lib/supabase'
import { StockRanking } from '@/components/StockRanking'

export const revalidate = 0

export default async function StocksPage() {
  const [subData, stockData, { entries: heatmapEntries, date: heatmapDate }] = await Promise.all([
    getLatestSubReturns(),
    getLatestStockReturns(),
    getStockHeatmap(),
  ])
  return (
    <main className="min-h-screen bg-white text-gray-900 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <StockRanking
        subData={subData}
        stockData={stockData}
        heatmapEntries={heatmapEntries}
        heatmapDate={heatmapDate}
      />
    </main>
  )
}
