import { NextRequest, NextResponse } from 'next/server'
import { getSubReturnsNDaysAgo } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function GET(req: NextRequest) {
  try {
    const daysBack = Math.min(
      Math.max(1, parseInt(req.nextUrl.searchParams.get('daysBack') ?? '5', 10)),
      90
    )
    const data = await getSubReturnsNDaysAgo(daysBack)
    return NextResponse.json(data)
  } catch (err) {
    console.error('prev-sub-returns error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
