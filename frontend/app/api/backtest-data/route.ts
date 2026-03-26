import { getDailySubHistory, getDailyStockHistory } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [subHistory, stockHistory] = await Promise.all([
    getDailySubHistory(),
    getDailyStockHistory(),
  ])
  return NextResponse.json({ subHistory, stockHistory })
}
