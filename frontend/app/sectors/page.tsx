import { getLatestSubReturns, getLatestDate } from '@/lib/supabase'
import { Heatmap } from '@/components/Heatmap'

export const revalidate = 0

export const metadata = { title: '產業總覽 | Sector Pulse' }

export default async function SectorsPage() {
  const [data, latestDate] = await Promise.all([
    getLatestSubReturns(),
    getLatestDate(),
  ])

  return (
    <main className="min-h-screen bg-gray-50">
      <Heatmap data={data} latestDate={latestDate} />
    </main>
  )
}
