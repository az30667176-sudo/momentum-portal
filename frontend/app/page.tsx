import { getLatestSubReturns, getLatestDate } from '@/lib/supabase'
import { Heatmap } from '@/components/Heatmap'

export const revalidate = 0

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
