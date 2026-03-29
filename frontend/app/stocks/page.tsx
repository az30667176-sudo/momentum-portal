import { getLatestSubReturns, getLatestStockReturns } from '@/lib/supabase'
import { StockRanking } from '@/components/StockRanking'

export const revalidate = 3600

export default async function StocksPage() {
  const [subData, stockData] = await Promise.all([
    getLatestSubReturns(),
    getLatestStockReturns(),
  ])
  return (
    <main className="p-4">
      <StockRanking subData={subData} stockData={stockData} />
    </main>
  )
}
