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
  stock_count: number | null
  sharpe_8w: number | null
  sortino_8w: number | null
  volatility_8w: number | null
  calmar_ratio: number | null
  rvol: number | null
  obv_trend: number | null
  vol_mom: number | null
  vol_surge_score: number | null
  cmf: number | null
  information_ratio: number | null
  momentum_decay_rate: number | null
  downside_capture: number | null
  leader_lagger_ratio: number | null
  beta: number | null
  momentum_autocorr: number | null
  price_trend_r2: number | null
  price_vs_ma5: number | null
  price_vs_ma20: number | null
  price_vs_ma100: number | null
  price_vs_ma200: number | null
  breadth_20ma: number | null
  breadth_50ma: number | null
  high_proximity: number | null
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
  ret_6m: number | null
  ret_12m: number | null
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
  ret_6m: number | null
  ret_12m: number | null
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
  rebalPeriod: number   // trading days (5=1W, 10=2W, 20=4W, 40=8W)
  weightMode: WeightMode
  maxStockWeight: number  // per-stock max weight %
  maxSubWeight: number    // per-sub-industry total weight %
  bufferRule: number
  stopLoss: number
  trailingStop: number
  takeProfit: number
  timeStop: number
  tradingCost: number
  isSplitPct: number
  spyMaFilter: boolean  // global regime filter: block new entries when SPY proxy < MA
  spyMaPeriod: number   // MA lookback in trading days (e.g. 200)
}

export type ExitReason = 'rebal' | 'stop_loss' | 'trailing_stop' | 'take_profit' | 'time_stop' | 'signal'

export interface Trade {
  ticker: string
  gics_code: string
  subName: string
  entryDate: string
  exitDate: string
  holdingDays: number
  weight: number       // portfolio weight at entry (0–1)
  pnlPct: number       // cumulative return % during holding
  exitReason: ExitReason
  rebalLogIdx: number  // which RebalLog entry caused the entry
}

export interface Holding {
  ticker: string
  gics_code: string
  subName: string
  entryDay: number
  entryDate: string
  entryEquity: number
  peakCumReturn: number
  cumReturn: number
  exitIndex: number    // tracks daily: starts 100, compounded each day
  weight: number       // portfolio weight at entry (0–1)
  rebalLogIdx: number  // which RebalLog this holding entered from
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
  stockEntriesCount: number   // stocks entering at this rebal
  stockExitsCount: number     // stocks exiting (rebal + stop) since prev rebal
}

export interface PerfMetrics {
  annRet: number
  sharpe: number
  sortino: number
  mdd: number
  wr: number
  calmar: number
  profitFactor: number
}

export interface BacktestResult {
  equityCurve: number[]
  drawdownCurve: number[]
  dailyReturns: number[]
  spyCurve: number[]
  ewCurve: number[]
  dates: string[]
  rebalLogs: RebalLog[]
  tradeHistory: Trade[]
  fullPerf: PerfMetrics
  isPerf: PerfMetrics
  oosPerf: PerfMetrics
  totalRebalCount: number
  totalExitCount: number
  stockDataAvailable: boolean
  isSplitDay: number
}

// ── Preset & Signal Scan ──────────────────────────────────────

export interface BacktestPreset {
  id: number
  name: string
  config: BacktestConfig
  created_at: string
  updated_at: string
}

export interface SignalHolding {
  subName: string
  gics_code: string
  ticker: string
  weight: number              // 0–1
  entryPrice: number | null   // last close on scanDate
  stopLossPrice: number | null
  takeProfitPrice: number | null
}

export interface ScanSignalResult {
  scanDate: string            // YYYY-MM-DD (most recent Friday or trading day ≤ it)
  requestedFriday: string     // The Friday we targeted
  holdingCount: number
  holdings: SignalHolding[]
  passedSubCount: number      // how many subs passed filters
  selectedSubCount: number    // how many subs selected after rank/topN
  warnings: string[]          // e.g. "X tickers missing close prices"
}

export interface ConsensusRow {
  ticker: string
  subName: string
  gics_code: string
  appearedIn: string[]
  count: number
  totalStrategies: number
  entryPrice: number | null
}
