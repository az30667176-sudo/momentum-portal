import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EDGE_FN_URL = `${process.env.SUPABASE_URL}/functions/v1/run-backtest`

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()

    const resp = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      },
      body,
    })

    const data = await resp.json()
    return NextResponse.json(data, { status: resp.status })
  } catch (err) {
    console.error('run-backtest proxy error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
