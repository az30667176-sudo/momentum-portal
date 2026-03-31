import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function makeClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      auth: { persistSession: false },
      global: {
        fetch: (url: RequestInfo | URL, options?: RequestInit) =>
          fetch(url, { ...options, cache: 'no-store' }),
      },
    }
  )
}

// GET /api/optimization-runs — returns last 10 runs (summary)
export async function GET() {
  try {
    const supabase = makeClient()
    const { data, error } = await supabase
      .from('optimization_runs')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)

    if (error) {
      console.error('[optimization-runs] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data ?? [], {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
