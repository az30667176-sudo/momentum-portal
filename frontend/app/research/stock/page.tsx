import { getNotableStocks } from '@/lib/notableStocks'
import { NotableStocksView } from '@/components/NotableStocksView'

export const revalidate = 0
export const metadata = { title: '個股話題 — 話題股與異常波動 | Sector Pulse' }

export default async function NotableStocksPage() {
  const [dailyData, weeklyData] = await Promise.all([
    getNotableStocks('daily'),
    getNotableStocks('weekly'),
  ])

  return <NotableStocksView dailyData={dailyData} weeklyData={weeklyData} />
}
