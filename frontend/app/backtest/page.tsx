import { getLatestSubReturns } from '@/lib/supabase'
import { BacktestEngine } from '@/components/BacktestEngine'

export const revalidate = 0

export default async function BacktestPage() {
  const latestData = await getLatestSubReturns()
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <BacktestEngine latestData={latestData} />
    </main>
  )
}
