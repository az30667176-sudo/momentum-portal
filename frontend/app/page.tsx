import { getLatestSubReturns, getLatestDate } from '@/lib/supabase'
import { Heatmap } from '@/components/Heatmap'

// 每小時重新 fetch 資料
export const revalidate = 3600

export default async function HomePage() {
  const [data, latestDate] = await Promise.all([
    getLatestSubReturns(),
    getLatestDate(),
  ])

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Heatmap data={data} latestDate={latestDate} />
    </main>
  )
}
