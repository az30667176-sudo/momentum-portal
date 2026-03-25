import { getSubHistory, getSubStocks } from '@/lib/supabase'
import { SubDetail } from '@/components/SubDetail'

export const revalidate = 3600

interface Props {
  params: { gicsCode: string }
}

export default async function SubDetailPage({ params }: Props) {
  const history = await getSubHistory(params.gicsCode)

  if (!history.length) {
    return (
      <div className="p-8 text-center text-gray-500">
        No data found for {params.gicsCode}
      </div>
    )
  }

  const latestDate = history[history.length - 1].date
  const stocks = await getSubStocks(params.gicsCode, latestDate)

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SubDetail gicsCode={params.gicsCode} history={history} stocks={stocks} />
    </main>
  )
}
