import { NextRequest, NextResponse } from 'next/server'
import { BacktestConfig } from '@/lib/types'
import { runSignalScan } from '@/lib/backtestEngine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { config } = (await req.json()) as { config: BacktestConfig }
    const result = await runSignalScan(config)
    return NextResponse.json(result)
  } catch (err) {
    console.error('scan-signal error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
