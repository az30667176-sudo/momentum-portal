import { NextRequest, NextResponse } from 'next/server'
import { BacktestConfig } from '@/lib/types'
import {
  fetchSubHistory,
  fetchFullStockHistory,
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

    // Fetch full stock history (ALL trading dates) so per-stock daily returns are used
    // instead of falling back to sub-industry returns on non-rebal days.
    // Cached in-process for 5 min via unstable_cache.
    const [stockHistory, spyReturns] = await Promise.all([
      fetchFullStockHistory(),
      fetchSpyHistory(),
    ])

    const result = runBacktestSync(config, subHistory, stockHistory, spyReturns)
    return NextResponse.json(result)
  } catch (err) {
    console.error('run-backtest error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
