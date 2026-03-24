import { getStockHeatmap } from '@/lib/supabase'
import { StockHeatmap } from '@/components/StockHeatmap'

export const revalidate = 3600

export default async function HomePage() {
  const { entries, date } = await getStockHeatmap()
  return <StockHeatmap entries={entries} date={date} />
}
