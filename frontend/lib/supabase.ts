import { createClient } from '@supabase/supabase-js'
import { SubReturn, StockReturn, StockHeatmapEntry, StockInfo } from './types'

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
    .order('date', { ascending: false })
    .limit(260)

  if (error) {
    console.error('getSubHistory error:', error)
    return []
  }

  // Reverse to ascending order for charts
  return ((data as SubReturn[]) || []).reverse()
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

// ── Stock Heatmap ─────────────────────────────────────────────

export async function getStockHeatmap(): Promise<{
  entries: StockHeatmapEntry[]
  date: string | null
}> {
  const supabase = createServerClient()

  // 1. Get latest date from daily_stock_returns
  const { data: latestRow } = await supabase
    .from('daily_stock_returns')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single()

  const latestDate = latestRow?.date ?? null

  // 2. Get full stock universe — paginate to bypass 1000-row PostgREST cap
  type UniverseRow = {
    ticker: string
    company: string
    index_member: string
    gics_code: string
    gics_universe: { sector: string; sub_industry: string } | null
  }
  const universeSelect = `ticker, company, index_member, gics_code, gics_universe ( sector, sub_industry )`
  const [uPage1, uPage2] = await Promise.all([
    supabase.from('stock_universe').select(universeSelect).eq('is_active', true).order('ticker').range(0, 999),
    supabase.from('stock_universe').select(universeSelect).eq('is_active', true).order('ticker').range(1000, 1999),
  ])
  if (uPage1.error) {
    console.error('getStockHeatmap universe error:', uPage1.error)
    return { entries: [], date: null }
  }
  const universe = [...(uPage1.data ?? []), ...(uPage2.data ?? [])] as UniverseRow[]

  // 3. If we have returns data, fetch it — paginate to bypass 1000-row cap
  let returnsMap = new Map<string, StockReturn>()

  if (latestDate) {
    const retSelect = 'ticker, ret_1d, ret_1w, ret_1m, ret_3m, mom_score, rank_in_sub, rvol'
    const [rPage1, rPage2] = await Promise.all([
      supabase.from('daily_stock_returns').select(retSelect).eq('date', latestDate).range(0, 999),
      supabase.from('daily_stock_returns').select(retSelect).eq('date', latestDate).range(1000, 1999),
    ])
    const allReturns = [...(rPage1.data ?? []), ...(rPage2.data ?? [])] as StockReturn[]
    for (const r of allReturns) {
      returnsMap.set(r.ticker, r)
    }
  }

  // 4. Merge universe + returns
  const entries: StockHeatmapEntry[] = []
  for (const row of universe as UniverseRow[]) {
    const gu = row.gics_universe
    if (!gu) continue

    const ret = returnsMap.get(row.ticker)

    entries.push({
      ticker: row.ticker,
      company: row.company,
      sector: gu.sector,
      sub_industry: gu.sub_industry,
      gics_code: row.gics_code,
      index_member: row.index_member,
      ret_1d: ret?.ret_1d ?? null,
      ret_1w: ret?.ret_1w ?? null,
      ret_1m: ret?.ret_1m ?? null,
      ret_3m: ret?.ret_3m ?? null,
      mom_score: ret?.mom_score ?? null,
      rank_in_sub: ret?.rank_in_sub ?? null,
      rvol: ret?.rvol ?? null,
      hasReturns: ret != null,
    })
  }

  return { entries, date: latestDate }
}

// ── Stock Detail ───────────────────────────────────────────────

export async function getStockInfo(ticker: string): Promise<StockInfo | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('stock_universe')
    .select('ticker, company, gics_code, index_member, gics_universe ( sector, sub_industry )')
    .eq('ticker', ticker)
    .single()

  if (error || !data) return null

  const gu = data.gics_universe as { sector: string; sub_industry: string } | null
  return {
    ticker:       data.ticker,
    company:      data.company,
    gics_code:    data.gics_code,
    index_member: data.index_member,
    sector:       gu?.sector ?? null,
    sub_industry: gu?.sub_industry ?? null,
  }
}

export async function getStockHistory(ticker: string): Promise<StockReturn[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('daily_stock_returns')
    .select('date, ticker, gics_code, ret_1d, ret_1w, ret_1m, ret_3m, mom_score, rank_in_sub, rvol, obv_trend')
    .eq('ticker', ticker)
    .order('date', { ascending: false })
    .limit(260)

  if (error) {
    console.error('getStockHistory error:', error)
    return []
  }

  return ((data as StockReturn[]) || []).reverse()
}

export async function getLatestSubReturn(gicsCode: string): Promise<SubReturn | null> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('daily_sub_returns')
    .select('*, gics_universe ( sector, industry_group, industry, sub_industry, etf_proxy )')
    .eq('gics_code', gicsCode)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return data as SubReturn
}
