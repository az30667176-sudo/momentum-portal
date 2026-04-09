import { getLatestSubReturns, getPrevSubReturns } from '@/lib/supabase'
import { BacktestEngine } from '@/components/BacktestEngine'

export const revalidate = 0

export default async function BacktestPage() {
  const [latestData, prevData] = await Promise.all([
    getLatestSubReturns(),
    getPrevSubReturns(),
  ])
  return (
    <main className="min-h-screen bg-gray-50 max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <BacktestEngine latestData={latestData} prevData={prevData} />
    </main>
  )
}
