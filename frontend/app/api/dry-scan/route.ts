import { NextRequest, NextResponse } from 'next/server'
import { BacktestConfig } from '@/lib/types'
import { fetchSubHistory, dryRunScan } from '@/lib/backtestEngine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { config } = (await req.json()) as { config: BacktestConfig }

    const subHistory = await fetchSubHistory()
    const gicsCodes = dryRunScan(config, subHistory)
    return NextResponse.json({ gicsCodes, subCount: gicsCodes.length, totalDays: subHistory.length })
  } catch (err) {
    console.error('dry-scan error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
