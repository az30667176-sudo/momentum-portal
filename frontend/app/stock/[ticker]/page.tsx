import { notFound } from 'next/navigation'
import { getStockInfo, getStockHistory, getLatestSubReturn } from '@/lib/supabase'
import { StockDetail } from '@/components/StockDetail'

export const revalidate = 0

interface Props {
  params: { ticker: string }
}

export default async function StockPage({ params }: Props) {
  const ticker = params.ticker.toUpperCase()

  const [info, history] = await Promise.all([
    getStockInfo(ticker),
    getStockHistory(ticker),
  ])

  if (!info || !history.length) notFound()

  const subReturn = await getLatestSubReturn(info.gics_code)

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <StockDetail info={info} history={history} subReturn={subReturn} />
    </main>
  )
}
