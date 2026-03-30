import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function makeClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      nTrials: number
      objective: string      // oos_sharpe | oos_calmar | oos_pf
      isSplitPct: number
      fixedConfig: Record<string, unknown>   // subFilters, rankBy, weightMode, etc.
      paramRanges: Record<string, unknown>   // topN_min, topN_max, etc.
    }

    const supabase = makeClient()

    // 1. Create a pending record in Supabase
    const { data: insertData, error: insertErr } = await supabase
      .from('optimization_runs')
      .insert({
        n_trials: body.nTrials,
        objective: body.objective,
        is_split_pct: body.isSplitPct,
        fixed_config: body.fixedConfig,
        param_ranges: body.paramRanges,
        status: 'pending',
      })
      .select('id')
      .single()

    if (insertErr || !insertData) {
      return NextResponse.json({ error: insertErr?.message ?? 'insert failed' }, { status: 500 })
    }
    const runId: number = insertData.id

    // 2. Trigger GitHub Actions workflow
    const ghToken = process.env.GITHUB_TOKEN
    const ghRepo = process.env.GITHUB_REPO  // e.g. "az30667176-sudo/momentum-portal"

    if (!ghToken || !ghRepo) {
      // Mark as failed if env vars missing
      await supabase.from('optimization_runs')
        .update({ status: 'failed', error_message: 'GITHUB_TOKEN or GITHUB_REPO env var not set' })
        .eq('id', runId)
      return NextResponse.json({ error: 'GITHUB_TOKEN/GITHUB_REPO not configured on server' }, { status: 500 })
    }

    const dispatchUrl = `https://api.github.com/repos/${ghRepo}/actions/workflows/optimize.yml/dispatches`
    const dispatchRes = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { run_id: String(runId) },
      }),
    })

    if (!dispatchRes.ok) {
      const errText = await dispatchRes.text()
      await supabase.from('optimization_runs')
        .update({ status: 'failed', error_message: `GH dispatch failed: ${errText}` })
        .eq('id', runId)
      return NextResponse.json({ error: `GitHub Actions dispatch failed: ${errText}` }, { status: 500 })
    }

    return NextResponse.json({ runId })
  } catch (err) {
    console.error('start-optimization error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
