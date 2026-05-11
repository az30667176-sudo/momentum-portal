import { getLatestStockReturns } from './supabase'
import { StockReturn } from './types'

// ── Types ───────────────────────────────────────────────────────

export interface NotableStock {
  ticker: string
  company: string
  sector: string
  sub_industry: string
  index_member: string | null
  gics_code: string
  return_pct: number
  industry_avg_pct: number
  diff_vs_industry: number
  z_score: number
  z_level: 'sub_industry' | 'sector'
  mom_score: number | null
  rvol: number | null
  notability_score: number
  abnormal_types: string[]
  direction_disagree: boolean
}

export interface ReversalStock {
  ticker: string
  company: string
  sector: string
  sub_industry: string
  index_member: string | null
  gics_code: string
  reversal_type: 'Rally Reversal' | 'Decline Reversal'
  prior_return_pct: number
  today_return_pct: number
  ret_1w: number
  reversal_score: number
  mom_score: number | null
  rvol: number | null
}

export interface NotableStocksResult {
  date: string
  mode: 'daily' | 'weekly'
  total_stocks: number
  market_summary: { median: number; mean: number; positive_pct: number }
  top_gainers: NotableStock[]
  top_losers: NotableStock[]
  industry_outliers: NotableStock[]
  reversals: ReversalStock[]
  summary: {
    total_flagged: number
    overlap_count: number
    sectors_with_most_outliers: { sector: string; count: number }[]
  }
}

// ── Constants ───────────────────────────────────────────────────

const Z_OUTLIER = 2.0
const Z_DISAGREE = 1.5
const MIN_GROUP = 5
const TOP_N = 10

// ── Helpers ─────────────────────────────────────────────────────

function safeNum(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return isFinite(n) ? n : null
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function med(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function sd(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = avg(arr)
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1)
  return Math.sqrt(variance)
}

// ── Access enriched fields from getLatestStockReturns() join ────

function getCompany(s: StockReturn): string {
  return (s as any).stock_universe?.company ?? ''
}
function getIndexMember(s: StockReturn): string | null {
  return (s as any).stock_universe?.index_member ?? null
}
function getSector(s: StockReturn): string {
  return (s as any).gics_universe?.sector ?? ''
}
function getSubIndustry(s: StockReturn): string {
  return (s as any).gics_universe?.sub_industry ?? ''
}
function getReturnVal(s: StockReturn, mode: 'daily' | 'weekly'): number | null {
  return safeNum(mode === 'weekly' ? s.ret_1w : s.ret_1d)
}

// ── Group Stats ─────────────────────────────────────────────────

interface GroupStats { mean: number; std: number; count: number }

function computeGroupStats(
  stocks: StockReturn[],
  groupFn: (s: StockReturn) => string,
  mode: 'daily' | 'weekly',
): Map<string, GroupStats> {
  const groups = new Map<string, number[]>()
  for (const s of stocks) {
    const key = groupFn(s)
    if (!key) continue
    const val = getReturnVal(s, mode)
    if (val == null) continue
    const arr = groups.get(key) ?? []
    arr.push(val)
    groups.set(key, arr)
  }
  const stats = new Map<string, GroupStats>()
  for (const [key, vals] of groups) {
    stats.set(key, { mean: avg(vals), std: sd(vals), count: vals.length })
  }
  return stats
}

// ── Notability Score ────────────────────────────────────────────

function computeNotabilityScore(
  returnPct: number,
  zScore: number,
  rvol: number | null,
  dirDisagree: boolean,
  allAbsReturns: number[],
): number {
  const zComp = Math.min(Math.abs(zScore) / 3.0, 1.0)
  const absRet = Math.abs(returnPct)
  let pctile = 0.5
  if (allAbsReturns.length > 0) {
    const rank = allAbsReturns.filter(r => r <= absRet).length
    pctile = rank / allAbsReturns.length
  }
  const dirPenalty = dirDisagree ? 1.0 : 0.0
  const rvolComp = rvol != null && rvol > 0 ? Math.min(rvol / 3.0, 1.0) : 0.0
  const score = 0.30 * zComp + 0.25 * pctile + 0.25 * dirPenalty + 0.20 * rvolComp
  return Math.round(score * 1000) / 10
}

// ── Reversal Detection ─────────────────────────────────────────

const PRIOR_THRESHOLD = 3.0
const TODAY_THRESHOLD = 3.0

function detectReversals(stocks: StockReturn[], mode: 'daily' | 'weekly'): ReversalStock[] {
  const results: ReversalStock[] = []
  for (const s of stocks) {
    const ret1d = safeNum(s.ret_1d)
    const ret1w = safeNum(s.ret_1w)
    if (ret1d == null || ret1w == null) continue
    if (Math.abs(ret1d) < TODAY_THRESHOLD) continue

    const prior4d = ((1 + ret1w / 100) / (1 + ret1d / 100) - 1) * 100
    if (Math.abs(prior4d) < PRIOR_THRESHOLD) continue

    const isRally = prior4d > 0 && ret1d < 0
    const isDecline = prior4d < 0 && ret1d > 0
    if (!isRally && !isDecline) continue

    const reversalScore = Math.min(Math.abs(ret1d) * 2 / 10, 100)

    results.push({
      ticker: s.ticker,
      company: getCompany(s),
      sector: getSector(s),
      sub_industry: getSubIndustry(s),
      index_member: getIndexMember(s),
      gics_code: s.gics_code,
      reversal_type: isRally ? 'Rally Reversal' : 'Decline Reversal',
      prior_return_pct: Math.round(prior4d * 100) / 100,
      today_return_pct: Math.round(ret1d * 100) / 100,
      ret_1w: Math.round(ret1w * 100) / 100,
      reversal_score: Math.round(reversalScore * 10) / 10,
      mom_score: safeNum(s.mom_score),
      rvol: safeNum(s.rvol),
    })
  }
  results.sort((a, b) => b.reversal_score - a.reversal_score)
  return results
}

// ── Main Function ───────────────────────────────────────────────

export async function getNotableStocks(mode: 'daily' | 'weekly'): Promise<NotableStocksResult> {
  const stocks = await getLatestStockReturns()
  const date = stocks.length > 0 ? stocks[0].date : ''

  // Group stats
  const subStats = computeGroupStats(stocks, getSubIndustry, mode)
  const sectorStats = computeGroupStats(stocks, getSector, mode)

  // All valid returns for percentile calculation
  const allReturns: number[] = []
  for (const s of stocks) {
    const v = getReturnVal(s, mode)
    if (v != null) allReturns.push(v)
  }
  const allAbsReturns = allReturns.map(r => Math.abs(r)).sort((a, b) => a - b)

  // Top movers
  const withVal = stocks
    .map(s => ({ s, val: getReturnVal(s, mode) }))
    .filter((x): x is { s: StockReturn; val: number } => x.val != null)
  withVal.sort((a, b) => b.val - a.val)

  const gainersRaw = withVal.slice(0, TOP_N).map(x => x.s)
  const losersRaw = withVal.slice(-TOP_N).reverse().map(x => x.s)
  const topGainersSet = new Set(gainersRaw.map(s => s.ticker))
  const topLosersSet = new Set(losersRaw.map(s => s.ticker))

  // Build a NotableStock entry from a StockReturn
  function buildEntry(s: StockReturn): NotableStock {
    const val = getReturnVal(s, mode) ?? 0
    const sub = getSubIndustry(s)
    const sector = getSector(s)

    const ss = subStats.get(sub)
    const se = sectorStats.get(sector)

    let z = 0, zLevel: 'sub_industry' | 'sector' = 'sub_industry'
    let industryAvg = 0

    if (ss && ss.count >= MIN_GROUP && ss.std > 1e-8) {
      z = (val - ss.mean) / ss.std; zLevel = 'sub_industry'; industryAvg = ss.mean
    } else if (se && se.std > 1e-8) {
      z = (val - se.mean) / se.std; zLevel = 'sector'; industryAvg = se.mean
    }

    const dirDisagree = Math.abs(industryAvg) > 0.1
      ? (val > 0 && industryAvg < 0) || (val < 0 && industryAvg > 0) : false

    return {
      ticker: s.ticker,
      company: getCompany(s),
      sector,
      sub_industry: sub,
      index_member: getIndexMember(s),
      gics_code: s.gics_code,
      return_pct: Math.round(val * 100) / 100,
      industry_avg_pct: Math.round(industryAvg * 100) / 100,
      diff_vs_industry: Math.round((val - industryAvg) * 100) / 100,
      z_score: Math.round(z * 100) / 100,
      z_level: zLevel,
      mom_score: safeNum(s.mom_score),
      rvol: safeNum(s.rvol),
      notability_score: computeNotabilityScore(val, z, safeNum(s.rvol), dirDisagree, allAbsReturns),
      abnormal_types: [],
      direction_disagree: dirDisagree,
    }
  }

  // Build gainer/loser entries
  const topGainers = gainersRaw.map(s => { const e = buildEntry(s); e.abnormal_types.push('Top Gainer'); return e })
  const topLosers = losersRaw.map(s => { const e = buildEntry(s); e.abnormal_types.push('Top Loser'); return e })

  // Detect all outliers
  const allOutliers: NotableStock[] = []
  for (const s of stocks) {
    const val = getReturnVal(s, mode)
    if (val == null) continue
    const sub = getSubIndustry(s)
    const sector = getSector(s)

    const ss = subStats.get(sub)
    const se = sectorStats.get(sector)

    let z: number, zLevel: 'sub_industry' | 'sector', groupMean: number
    if (ss && ss.count >= MIN_GROUP && ss.std > 1e-8) {
      z = (val - ss.mean) / ss.std; zLevel = 'sub_industry'; groupMean = ss.mean
    } else if (se && se.std > 1e-8) {
      z = (val - se.mean) / se.std; zLevel = 'sector'; groupMean = se.mean
    } else {
      continue
    }

    const dirDisagree = Math.abs(groupMean) > 0.1
      ? (val > 0 && groupMean < 0) || (val < 0 && groupMean > 0) : false

    const types: string[] = []
    if (topGainersSet.has(s.ticker)) types.push('Top Gainer')
    if (topLosersSet.has(s.ticker)) types.push('Top Loser')

    if (!dirDisagree) {
      if (z >= Z_OUTLIER) types.push('Strong Outperformer')
      else if (z <= -Z_OUTLIER) types.push('Strong Underperformer')
    } else {
      if (Math.abs(z) >= Z_DISAGREE) {
        types.push(val > 0 ? 'Industry Outlier – Positive' : 'Industry Outlier – Negative')
      }
    }

    if (types.length === 0) continue

    const industryAvg = ss ? ss.mean : (se ? se.mean : 0)
    allOutliers.push({
      ticker: s.ticker,
      company: getCompany(s),
      sector,
      sub_industry: sub,
      index_member: getIndexMember(s),
      gics_code: s.gics_code,
      return_pct: Math.round(val * 100) / 100,
      industry_avg_pct: Math.round(industryAvg * 100) / 100,
      diff_vs_industry: Math.round((val - industryAvg) * 100) / 100,
      z_score: Math.round(z * 100) / 100,
      z_level: zLevel,
      mom_score: safeNum(s.mom_score),
      rvol: safeNum(s.rvol),
      notability_score: computeNotabilityScore(val, z, safeNum(s.rvol), dirDisagree, allAbsReturns),
      abnormal_types: types,
      direction_disagree: dirDisagree,
    })
  }
  allOutliers.sort((a, b) => b.notability_score - a.notability_score)

  // Merge outlier types into gainers/losers
  const outlierMap = new Map(allOutliers.map(o => [o.ticker, o]))
  for (const g of topGainers) {
    const o = outlierMap.get(g.ticker)
    if (o) {
      for (const t of o.abnormal_types) { if (!g.abnormal_types.includes(t)) g.abnormal_types.push(t) }
      g.z_score = o.z_score; g.z_level = o.z_level
    }
  }
  for (const l of topLosers) {
    const o = outlierMap.get(l.ticker)
    if (o) {
      for (const t of o.abnormal_types) { if (!l.abnormal_types.includes(t)) l.abnormal_types.push(t) }
      l.z_score = o.z_score; l.z_level = o.z_level
    }
  }

  // Separate industry-only outliers
  const topTickerSet = new Set([...topGainersSet, ...topLosersSet])
  const industryOutliers = allOutliers.filter(o => !topTickerSet.has(o.ticker))
  const overlapCount = allOutliers.filter(o => topTickerSet.has(o.ticker)).length

  // Sector counts
  const sectorCounts = new Map<string, number>()
  for (const o of allOutliers) sectorCounts.set(o.sector, (sectorCounts.get(o.sector) ?? 0) + 1)
  const sectorsWithMost = [...sectorCounts.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([sector, count]) => ({ sector, count }))

  const positivePct = allReturns.length > 0
    ? Math.round(allReturns.filter(r => r > 0).length / allReturns.length * 1000) / 10 : 0

  const reversals = detectReversals(stocks, mode)

  return {
    date, mode, total_stocks: stocks.length,
    market_summary: {
      median: Math.round(med(allReturns) * 100) / 100,
      mean: Math.round(avg(allReturns) * 100) / 100,
      positive_pct: positivePct,
    },
    top_gainers: topGainers,
    top_losers: topLosers,
    industry_outliers: industryOutliers,
    reversals,
    summary: { total_flagged: allOutliers.length, overlap_count: overlapCount, sectors_with_most_outliers: sectorsWithMost },
  }
}
