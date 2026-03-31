import { NextRequest, NextResponse } from 'next/server'
import { BacktestConfig } from '@/lib/types'
import {
  fetchSubHistory,
  fetchStockHistoryByRebalPeriod,
  fetchSpyHistory,
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

    // Stock data is cached by rebalPeriod for 5 min — same rebalPeriod reuses cached data,
    // so rapid repeated runs with the same rebalPeriod hit zero DB queries for stock data.
    const [stockHistory, spyReturns] = await Promise.all([
      fetchStockHistoryByRebalPeriod(config.rebalPeriod),
      fetchSpyHistory(),
    ])

    const result = runBacktestSync(config, subHistory, stockHistory, spyReturns)
    return NextResponse.json(result)
  } catch (err) {
    console.error('run-backtest error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
