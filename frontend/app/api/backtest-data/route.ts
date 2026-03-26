import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { SubReturn, DailySubSnapshot, DailyStockSnapshot } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function createServerClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  )
}

const SUB_SELECT = [
  'date', 'gics_code', 'ret_1d', 'ret_1w', 'ret_1m', 'ret_3m', 'ret_6m', 'ret_12m',
  'mom_score', 'rank_today', 'rank_prev_week', 'delta_rank', 'stock_count',
  'obv_trend', 'rvol', 'vol_mom', 'pv_divergence',
  'sharpe_8w', 'sortino_8w', 'win_rate_8w', 'volatility_8w', 'skewness',
  'information_ratio', 'momentum_decay_rate', 'breadth_adj_mom',
  'downside_capture', 'calmar_ratio', 'rs_trend_slope',
  'leader_lagger_ratio', 'cmf', 'mfi', 'vrsi', 'pvt_slope',
  'vol_surge_score', 'beta', 'momentum_autocorr', 'price_trend_r2', 'ad_slope',
  'breadth_pct',
  'gics_universe(sector,industry_group,industry,sub_industry,etf_proxy)',
].join(',')

export async function GET() {
  const supabase = createServerClient()

  // ── Sub history: parallel page fetch ──────────────────────
  const { count } = await supabase
    .from('daily_sub_returns')
    .select('*', { count: 'exact', head: true })

  const total = count ?? 0
  const pageSize = 1000
  const pageCount = Math.ceil(total / pageSize)

  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      supabase
        .from('daily_sub_returns')
        .select(SUB_SELECT)
        .order('date', { ascending: true })
        .range(i * pageSize, (i + 1) * pageSize - 1)
    )
  )

  const allSubRows = pages.flatMap(p => (p.data ?? []) as SubReturn[])

  const subByDate = new Map<string, SubReturn[]>()
  for (const row of allSubRows) {
    const arr = subByDate.get(row.date) ?? []
    arr.push(row)
    subByDate.set(row.date, arr)
  }
  const subHistory: DailySubSnapshot[] = Array.from(subByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, subs]) => ({ date, subs }))

  // ── Stock history: single RPC call ────────────────────────
  const { data: stockRaw, error: stockErr } = await supabase
    .rpc('get_backtest_stock_history')

  if (stockErr) {
    console.error('get_backtest_stock_history RPC error:', stockErr)
  }

  // RPC returns JSON array of { date, stocks[] }
  const stockHistory: DailyStockSnapshot[] = Array.isArray(stockRaw)
    ? (stockRaw as DailyStockSnapshot[]).sort((a, b) =>
        a.date.localeCompare(b.date)
      )
    : []

  return NextResponse.json({ subHistory, stockHistory })
}
