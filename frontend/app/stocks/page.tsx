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
    <main className="p-4">
      <StockRanking
        subData={subData}
        stockData={stockData}
        heatmapEntries={heatmapEntries}
        heatmapDate={heatmapDate}
      />
    </main>
  )
}
