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

    // Two-pass: collect rebal dates, then fetch stock data only for recent dates.
    // Stock data only exists for ~1 year (older dates fall back to sub-level).
    // Limiting to 1 year cuts fetch time from ~18s to ~6s, keeping under Vercel 60s.
    const rebalDates = collectRebalDates(config, subHistory)
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const cutoff = oneYearAgo.toISOString().split('T')[0]
    const recentRebalDates = rebalDates.filter(d => d >= cutoff)
    const stockHistory = await fetchStockHistoryForDates(recentRebalDates)

    const result = runBacktestSync(config, subHistory, stockHistory)
    return NextResponse.json(result)
  } catch (err) {
    console.error('run-backtest error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
