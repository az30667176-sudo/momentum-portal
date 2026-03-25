-- 新增所有量化指標欄位到 daily_sub_returns
-- 執行方式：
--   psql "postgresql://postgres:[DB_PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres" \
--     -f supabase/add_all_indicators.sql

ALTER TABLE daily_sub_returns
  ADD COLUMN IF NOT EXISTS information_ratio    numeric(7,4),
  ADD COLUMN IF NOT EXISTS momentum_decay_rate  numeric(7,2),
  ADD COLUMN IF NOT EXISTS breadth_adj_mom      numeric(8,4),
  ADD COLUMN IF NOT EXISTS downside_capture     numeric(6,4),
  ADD COLUMN IF NOT EXISTS calmar_ratio         numeric(7,4),
  ADD COLUMN IF NOT EXISTS rs_trend_slope       numeric(10,6),
  ADD COLUMN IF NOT EXISTS leader_lagger_ratio  numeric(6,4),
  ADD COLUMN IF NOT EXISTS cmf                  numeric(6,4),
  ADD COLUMN IF NOT EXISTS mfi                  numeric(5,2),
  ADD COLUMN IF NOT EXISTS vrsi                 numeric(5,2),
  ADD COLUMN IF NOT EXISTS pvt_slope            numeric(12,6),
  ADD COLUMN IF NOT EXISTS vol_surge_score      numeric(5,2),
  ADD COLUMN IF NOT EXISTS beta                 numeric(7,4),
  ADD COLUMN IF NOT EXISTS momentum_autocorr    numeric(6,4),
  ADD COLUMN IF NOT EXISTS price_trend_r2       numeric(5,4),
  ADD COLUMN IF NOT EXISTS ad_slope             numeric(12,6);
