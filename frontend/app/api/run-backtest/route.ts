import { NextRequest, NextResponse } from 'next/server'
import { BacktestConfig } from '@/lib/types'
import { fetchBacktestData, runBacktestSync } from '@/lib/backtestEngine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { config } = (await req.json()) as { config: BacktestConfig }
    const { subHistory, stockHistory } = await fetchBacktestData()

    if (subHistory.length < 20) {
      return NextResponse.json({ error: '歷史資料不足 20 天' }, { status: 400 })
    }

    const result = runBacktestSync(config, subHistory, stockHistory)
    return NextResponse.json(result)
  } catch (err) {
    console.error('run-backtest error:', err)
    const msg = String(err)
    const isMidWrite = msg.includes('mid-write') || msg.includes('RPC failed')
    return NextResponse.json(
      { error: isMidWrite ? 'Supabase 正在寫入資料，請稍候再試' : msg },
      { status: 500 }
    )
  }
}
