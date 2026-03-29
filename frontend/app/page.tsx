import { getStockHeatmap } from '@/lib/supabase'
import { StockHeatmap } from '@/components/StockHeatmap'

export const revalidate = 0

export default async function HomePage() {
  const { entries, date } = await getStockHeatmap()
  return (
    <div className="min-h-screen bg-gray-900">
      <StockHeatmap entries={entries} date={date} />
    </div>
  )
}
