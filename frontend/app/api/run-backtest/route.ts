import { NextRequest, NextResponse } from 'next/server'
import { BacktestConfig } from '@/lib/types'
import {
  fetchSubHistory,
  fetchStockHistoryForDates,
  collectRebalDates,
  runBacktestSync,
} from '@/lib/backtestEngine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { config } = (await req.json()) as { config: BacktestConfig }

    const subHistory = await fetchSubHistory()
    if (subHistory.length < 20) {
      return NextResponse.json({ error: '歷史資料不足 20 天' }, { status: 400 })
    }

    // Two-pass: collect rebal dates, then fetch stock data only for those dates
    const allRebalDates = collectRebalDates(config, subHistory)
    const rebalDates = allRebalDates.slice(-50)
    const stockHistory = await fetchStockHistoryForDates(rebalDates)

    const result = runBacktestSync(config, subHistory, stockHistory)
    return NextResponse.json(result)
  } catch (err) {
    console.error('run-backtest error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
