import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function makeClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  )
}

// GET /api/optimization-runs — returns last 10 runs (summary)
export async function GET() {
  try {
    const supabase = makeClient()
    const { data, error } = await supabase
      .from('optimization_runs')
      .select('id,run_at,n_trials,objective,is_split_pct,status,best_score,best_params,all_trials,error_message,completed_at')
      .order('id', { ascending: false })
      .limit(10)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
