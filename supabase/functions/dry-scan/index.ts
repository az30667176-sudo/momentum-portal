/**
 * dry-scan Edge Function
 * Queries daily_sub_returns directly via Postgres, runs dryRunScan.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js"
import {
  BacktestConfig, DailySubSnapshot, SubReturn, GicsUniverse,
  dryRunScan,
} from "../_shared/engine.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { config } = (await req.json()) as { config: BacktestConfig }

    const dbUrl = Deno.env.get("SUPABASE_DB_URL")!
    const sql = postgres(dbUrl, { ssl: "require", prepare: false, max: 2 })

    try {
      const [subRows, gicsRows] = await Promise.all([
        sql`
          SELECT
            date::text AS date, gics_code,
            ret_1d, ret_1w, ret_1m, ret_3m, ret_6m, ret_12m,
            mom_6m, mom_12m, mom_score,
            rank_today, rank_prev_week, delta_rank,
            obv_trend, rvol, vol_mom, pv_divergence,
            stock_count, breadth_pct, volatility_8w
          FROM daily_sub_returns
          ORDER BY date, gics_code
        `,
        sql`
          SELECT gics_code, sector, industry_group, industry, sub_industry, etf_proxy
          FROM gics_universe
        `,
      ])

      const gicsMap = new Map<string, GicsUniverse>()
      for (const g of gicsRows) {
        gicsMap.set(g.gics_code as string, g as unknown as GicsUniverse)
      }

      const subByDate = new Map<string, SubReturn[]>()
      for (const row of subRows) {
        const date = row.date as string
        if (!subByDate.has(date)) subByDate.set(date, [])
        const sub: SubReturn = {
          date,
          gics_code: row.gics_code as string,
          ret_1d: row.ret_1d != null ? Number(row.ret_1d) : null,
          ret_1w: row.ret_1w != null ? Number(row.ret_1w) : null,
          ret_1m: row.ret_1m != null ? Number(row.ret_1m) : null,
          ret_3m: row.ret_3m != null ? Number(row.ret_3m) : null,
          ret_6m: row.ret_6m != null ? Number(row.ret_6m) : null,
          ret_12m: row.ret_12m != null ? Number(row.ret_12m) : null,
          mom_6m: row.mom_6m != null ? Number(row.mom_6m) : null,
          mom_12m: row.mom_12m != null ? Number(row.mom_12m) : null,
          mom_score: row.mom_score != null ? Number(row.mom_score) : null,
          rank_today: row.rank_today != null ? Number(row.rank_today) : null,
          rank_prev_week: row.rank_prev_week != null ? Number(row.rank_prev_week) : null,
          delta_rank: row.delta_rank != null ? Number(row.delta_rank) : null,
          obv_trend: row.obv_trend != null ? Number(row.obv_trend) : null,
          rvol: row.rvol != null ? Number(row.rvol) : null,
          vol_mom: row.vol_mom != null ? Number(row.vol_mom) : null,
          pv_divergence: row.pv_divergence as string | null,
          stock_count: row.stock_count != null ? Number(row.stock_count) : null,
          breadth_pct: row.breadth_pct != null ? Number(row.breadth_pct) : null,
          volatility_8w: row.volatility_8w != null ? Number(row.volatility_8w) : null,
          gics_universe: gicsMap.get(row.gics_code as string),
        }
        subByDate.get(date)!.push(sub)
      }

      const subHistory: DailySubSnapshot[] = Array.from(subByDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, subs]) => ({ date, subs }))

      const gicsCodes = dryRunScan(config, subHistory)
      return new Response(
        JSON.stringify({ gicsCodes, subCount: gicsCodes.length, totalDays: subHistory.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    } finally {
      await sql.end()
    }
  } catch (err) {
    console.error("dry-scan edge error:", err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
