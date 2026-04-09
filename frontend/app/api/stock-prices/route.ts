import { NextResponse } from 'next/server'

export const maxDuration = 15

/**
 * GET /api/stock-prices?ticker=AAPL&range=3y
 * Returns daily close prices from Yahoo Finance Chart API.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const rawTicker = searchParams.get('ticker')
  const range = searchParams.get('range') || '3y'

  if (!rawTicker) {
    return NextResponse.json({ error: 'ticker required' }, { status: 400 })
  }

  const ticker = rawTicker.replace('.', '-')

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d&includePrePost=false`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 }, // cache 1 hour
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo returned ${res.status}` }, { status: 502 })
    }

    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result) {
      return NextResponse.json({ error: 'No data from Yahoo' }, { status: 404 })
    }

    const timestamps: number[] = result.timestamp || []
    const closes: number[] = result.indicators?.quote?.[0]?.close || []

    const prices: { time: string; value: number }[] = []
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue
      const d = new Date(timestamps[i] * 1000)
      const dateStr = d.toISOString().slice(0, 10)
      prices.push({ time: dateStr, value: Math.round(closes[i] * 100) / 100 })
    }

    return NextResponse.json({ ticker: rawTicker, prices })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'fetch failed' }, { status: 500 })
  }
}
