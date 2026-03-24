import { createClient } from '@supabase/supabase-js'
import { SubReturn, StockReturn } from './types'

function createServerClient() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_KEY!

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local'
    )
  }

  return createClient(url, key, {
    auth: { persistSession: false }
  })
}

export async function getLatestSubReturns(): Promise<SubReturn[]> {
  const supabase = createServerClient()

  const { data: latest } = await supabase
    .from('daily_sub_returns')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (!latest) return []

  const { data, error } = await supabase
    .from('daily_sub_returns')
    .select(`
      *,
      gics_universe (
        sector, industry_group, industry, sub_industry, etf_proxy
      )
    `)
    .eq('date', latest.date)
    .order('mom_score', { ascending: false })

  if (error) {
    console.error('getLatestSubReturns error:', error)
    return []
  }

  return (data as SubReturn[]) || []
}

export async function getSubHistory(gicsCode: string): Promise<SubReturn[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('daily_sub_returns')
    .select(`
      *,
      gics_universe (
        sector, industry_group, industry, sub_industry, etf_proxy
      )
    `)
    .eq('gics_code', gicsCode)
    .order('date', { ascending: true })
    .limit(260)

  if (error) {
    console.error('getSubHistory error:', error)
    return []
  }

  return (data as SubReturn[]) || []
}

export async function getSubStocks(
  gicsCode: string,
  targetDate: string
): Promise<StockReturn[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('daily_stock_returns')
    .select('*')
    .eq('gics_code', gicsCode)
    .eq('date', targetDate)
    .order('mom_score', { ascending: false })

  if (error) {
    console.error('getSubStocks error:', error)
    return []
  }

  return (data as StockReturn[]) || []
}

export async function getLatestDate(): Promise<string | null> {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('daily_sub_returns')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single()
  return data?.date || null
}
