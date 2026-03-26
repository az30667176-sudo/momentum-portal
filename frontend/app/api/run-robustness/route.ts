import { NextRequest, NextResponse } from 'next/server'
import { BacktestConfig } from '@/lib/types'
import { fetchBacktestData, runBacktestSync } from '@/lib/backtestEngine'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { config, param, values } = (await req.json()) as {
      config: BacktestConfig
      param: string
      values: number[]
    }

    // Fetch data once, reuse for all sweep runs
    const { subHistory, stockHistory } = await fetchBacktestData()

    if (subHistory.length < 20) {
      return NextResponse.json({ error: '歷史資料不足 20 天' }, { status: 400 })
    }

    const results = values.map(paramVal => {
      const testConfig = { ...config, [param]: paramVal } as BacktestConfig
      const res = runBacktestSync(testConfig, subHistory, stockHistory)
      return { param: paramVal, oosS: res.oosPerf.sharpe, perf: res.oosPerf }
    })

    return NextResponse.json(results)
  } catch (err) {
    console.error('run-robustness error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
