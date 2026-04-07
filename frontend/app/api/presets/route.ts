import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BacktestConfig } from '@/lib/types'

export const dynamic = 'force-dynamic'

function client() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { persistSession: false } }
  )
}

// GET /api/presets — list all presets ordered by updated_at desc
export async function GET() {
  try {
    const sb = client()
    const { data, error } = await sb
      .from('backtest_presets')
      .select('id,name,config,created_at,updated_at')
      .order('updated_at', { ascending: false })
    if (error) throw new Error(error.message)
    return NextResponse.json({ presets: data ?? [] })
  } catch (err) {
    console.error('presets GET error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/presets — upsert by name (create or update if name exists)
export async function POST(req: NextRequest) {
  try {
    const { name, config } = (await req.json()) as { name: string; config: BacktestConfig }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!config) {
      return NextResponse.json({ error: 'config is required' }, { status: 400 })
    }
    const sb = client()
    const { data, error } = await sb
      .from('backtest_presets')
      .upsert(
        { name: name.trim(), config, updated_at: new Date().toISOString() },
        { onConflict: 'name' }
      )
      .select()
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ preset: data })
  } catch (err) {
    console.error('presets POST error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/presets?id=123
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    const sb = client()
    const { error } = await sb.from('backtest_presets').delete().eq('id', Number(id))
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('presets DELETE error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
