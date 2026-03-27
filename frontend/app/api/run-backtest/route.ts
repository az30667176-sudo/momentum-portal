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
      // Surface real cause: check if Supabase RPC returned an error
      const { data: subRaw, error: subErr } = await (async () => {
        const { createClient } = await import('@supabase/supabase-js')
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } })
        return sb.rpc('get_backtest_sub_history')
      })()
      const detail = subErr ? `RPC error: ${JSON.stringify(subErr)}` : `got ${Array.isArray(subRaw) ? subRaw.length : 0} days`
      return NextResponse.json({ error: `歷史資料不足 20 天（${detail}）` }, { status: 400 })
    }

    const result = runBacktestSync(config, subHistory, stockHistory)
    return NextResponse.json(result)
  } catch (err) {
    console.error('run-backtest error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
