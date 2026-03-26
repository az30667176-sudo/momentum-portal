import { getDailySubHistory, getDailyStockHistory } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const [subHistory, stockHistory] = await Promise.all([
    getDailySubHistory(),
    getDailyStockHistory(),
  ])
  return NextResponse.json({ subHistory, stockHistory })
}
