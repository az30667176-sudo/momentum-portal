import { NextResponse } from 'next/server'

export const maxDuration = 15

/**
 * GET /api/stock-prices?ticker=AAPL&range=3y
 * Returns daily OHLC + volume data from Yahoo Finance Chart API.
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
      next: { revalidate: 3600 },
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
    const quote = result.indicators?.quote?.[0] || {}
    const opens:   number[] = quote.open   || []
    const highs:   number[] = quote.high   || []
    const lows:    number[] = quote.low    || []
    const closes:  number[] = quote.close  || []
    const volumes: number[] = quote.volume || []

    const ohlc: { time: string; open: number; high: number; low: number; close: number }[] = []
    const vol:  { time: string; value: number; color: string }[] = []

    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null || opens[i] == null) continue
      const d = new Date(timestamps[i] * 1000)
      const dateStr = d.toISOString().slice(0, 10)
      const r = (v: number) => Math.round(v * 100) / 100
      ohlc.push({
        time:  dateStr,
        open:  r(opens[i]),
        high:  r(highs[i]),
        low:   r(lows[i]),
        close: r(closes[i]),
      })
      vol.push({
        time:  dateStr,
        value: volumes[i] || 0,
        color: closes[i] >= opens[i] ? '#22c55e66' : '#ef444466',
      })
    }

    return NextResponse.json({ ticker: rawTicker, ohlc, vol })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'fetch failed' }, { status: 500 })
  }
}
