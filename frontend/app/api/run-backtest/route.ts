import { NextRequest, NextResponse } from 'next/server'
import { BacktestConfig } from '@/lib/types'
import {
  fetchSubHistory,
  fetchStockHistoryForDates,
  fetchSpyHistory,
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

    // Two-pass: collect rebal dates, then fetch stock data for all dates.
    // Backfill has populated 3 years of daily_stock_returns, so no cutoff needed.
    // ~150 rebal dates × ~1500 stocks / 10 per batch / 3 parallel ≈ 15-25s, safe under 60s.
    const rebalDates = collectRebalDates(config, subHistory)
    const [stockHistory, spyReturns] = await Promise.all([
      fetchStockHistoryForDates(rebalDates),
      fetchSpyHistory(),
    ])

    const result = runBacktestSync(config, subHistory, stockHistory, spyReturns)
    return NextResponse.json(result)
  } catch (err) {
    console.error('run-backtest error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
