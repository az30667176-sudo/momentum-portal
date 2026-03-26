export interface GicsUniverse {
  id: number
  gics_code: string
  sector: string
  industry_group: string | null
  industry: string | null
  sub_industry: string
  etf_proxy: string | null
}

export interface SubReturn {
  date: string
  gics_code: string
  ret_1d: number | null
  ret_1w: number | null
  ret_1m: number | null
  ret_3m: number | null
  ret_6m: number | null
  ret_12m: number | null
  mom_6m: number | null
  mom_12m: number | null
  mom_score: number | null
  rank_today: number | null
  rank_prev_week: number | null
  delta_rank: number | null
  breadth_pct: number | null
  rs_ratio: number | null
  sharpe_8w: number | null
  sortino_8w: number | null
  win_rate_8w: number | null
  volatility_8w: number | null
  trend_r2: number | null
  acceleration: number | null
  max_rank_dd: number | null
  consistency_8w: number | null
  top25_freq: number | null
  skewness: number | null
  annual_return: number | null
  rvol: number | null
  obv_trend: number | null
  vol_mom: number | null
  pv_divergence: string | null
  stock_count: number | null
  information_ratio: number | null
  momentum_decay_rate: number | null
  breadth_adj_mom: number | null
  downside_capture: number | null
  calmar_ratio: number | null
  rs_trend_slope: number | null
  leader_lagger_ratio: number | null
  cmf: number | null
  mfi: number | null
  vrsi: number | null
  pvt_slope: number | null
  vol_surge_score: number | null
  beta: number | null
  momentum_autocorr: number | null
  price_trend_r2: number | null
  ad_slope: number | null
  gics_universe?: GicsUniverse
}

export interface StockReturn {
  date: string
  ticker: string
  gics_code: string
  ret_1d: number | null
  ret_1w: number | null
  ret_1m: number | null
  ret_3m: number | null
  mom_score: number | null
  rank_in_sub: number | null
  rvol: number | null
  obv_trend: number | null
}

export interface StockInfo {
  ticker:       string
  company:      string
  gics_code:    string
  index_member: string | null
  sector:       string | null
  sub_industry: string | null
}

// Enriched stock entry for the stock heatmap (joined with universe tables)
export interface StockHeatmapEntry {
  ticker: string
  company: string
  sector: string
  sub_industry: string
  gics_code: string
  index_member: string  // SP500 / SP400 / SP600
  ret_1d: number | null
  ret_1w: number | null
  ret_1m: number | null
  ret_3m: number | null
  mom_score: number | null
  rank_in_sub: number | null
  rvol: number | null
  // derived
  hasReturns: boolean
}

// ── Backtest Types ─────────────────────────────────────────────

export interface DailySubSnapshot {
  date: string
  subs: SubReturn[]
}

export interface DailyStockSnapshot {
  date: string
  stocks: StockReturn[]
}

export type FilterType = 'static' | 'crossover' | 'delta' | 'rank_break'
export type FilterOp = '>=' | '<=' | 'between' | 'rise' | 'fall'
export type CrossoverDir = 'neg_to_pos' | 'pos_to_neg'
export type RankMode = 'top_pct' | 'improve'
export type WeightMode = 'equal' | 'momentum' | 'volatility'

export interface SubFilter {
  id: string
  type: FilterType
  indicator: string
  op?: FilterOp
  direction?: CrossoverDir
  mode?: RankMode
  value: number
  value2?: number
}

export interface BacktestConfig {
  subFilters: SubFilter[]
  exitFilters: SubFilter[]
  rankBy: string
  rankDir: 'desc' | 'asc'
  topN: number
  stockRankBy: string
  stocksPerSub: number
  rebalPeriod: 1 | 2 | 4 | 8
  weightMode: WeightMode
  maxSingleWeight: number
  bufferRule: number
  stopLoss: number
  trailingStop: number
  takeProfit: number
  timeStop: number
  tradingCost: number
  isSplitPct: number
}

export interface Holding {
  ticker: string
  gics_code: string
  subName: string
  entryDay: number
  entryEquity: number
  peakCumReturn: number
  cumReturn: number
}

export interface Candidate {
  ticker: string
  gics_code: string
  subName: string
}

export interface PendingOrder {
  ticker: string
  gics_code: string
  subName: string
}

export interface FilterConditionDetail {
  indicator: string
  type: FilterType
  currVal: number | null
  prevVal: number | null
  passed: boolean
}

export interface FilterDetail {
  subName: string
  gics_code: string
  passed: boolean
  conditions: FilterConditionDetail[]
}

export interface RebalLog {
  day: number
  date: string
  isOOS: boolean
  selectedSubs: string[]
  entering: string[]
  exiting: string[]
  holdingCount: number
  exitedToday: string[]
  filterDetails: FilterDetail[]
}

export interface PerfMetrics {
  annRet: number
  sharpe: number
  sortino: number
  mdd: number
  wr: number
}

export interface BacktestResult {
  equityCurve: number[]
  drawdownCurve: number[]
  dailyReturns: number[]
  spyCurve: number[]
  ewCurve: number[]
  dates: string[]
  rebalLogs: RebalLog[]
  fullPerf: PerfMetrics
  isPerf: PerfMetrics
  oosPerf: PerfMetrics
  totalRebalCount: number
  totalExitCount: number
  stockDataAvailable: boolean
  isSplitDay: number
}
