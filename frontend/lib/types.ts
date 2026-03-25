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
