import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  )

  // Get latest date
  const { data: latest } = await supabase
    .from('daily_stock_returns')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (!latest) return NextResponse.json({ error: 'no data' })

  // Get 3 rows for that date showing all columns
  const { data, error } = await supabase
    .from('daily_stock_returns')
    .select('date, ticker, ret_1m, ret_3m, ret_6m, ret_12m, mom_score')
    .eq('date', latest.date)
    .limit(3)

  return NextResponse.json({ latestDate: latest.date, sample: data, error })
}
