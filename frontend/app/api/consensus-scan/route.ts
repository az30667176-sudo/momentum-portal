import { NextRequest, NextResponse } from 'next/server'
import { BacktestConfig } from '@/lib/types'
import { runBatchSignalScan } from '@/lib/backtestEngine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { configs } = (await req.json()) as {
      configs: { name: string; config: BacktestConfig }[]
    }
    const result = await runBatchSignalScan(configs)
    return NextResponse.json(result)
  } catch (err) {
    console.error('consensus-scan error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
