"""
main.py
Pipeline 主程式：整合所有模組，每日執行一次

執行方式：
  python pipeline/main.py                      # 一般執行
  python pipeline/main.py --backfill           # 首次執行回填 1 年歷史
  python pipeline/main.py --backfill --years 3 # 回填 3 年歷史
  FORCE_RERUN=true python pipeline/main.py     # 強制重跑今天
"""

import os
import sys
import logging
import argparse
import time
from datetime import date, datetime, timedelta
from pathlib import Path

# 確保 momentum-portal/ 目錄在 sys.path，無論從哪裡執行
_root = Path(__file__).resolve().parent.parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from dotenv import load_dotenv

load_dotenv(dotenv_path=_root / ".env")

# ─── Logging 設定 ─────────────────────────────────────────────
_handler = logging.StreamHandler(sys.stdout)
_handler.stream = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(module)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[_handler],
)
logger = logging.getLogger(__name__)


def run_pipeline_for_date(
    target_date: date,
    universe_df,
    close_all,
    volume_all,
    spy_close,
    supabase,
    prev_ranks: dict,
    high_all=None,
    low_all=None,
) -> dict:
    """
    對指定日期計算所有 sub-industry 指標並 upsert。

    Returns
    -------
    dict
        {"success": int, "failed": int, "date": str}
    """
    import numpy as np
    from pipeline.calculator import (
        calc_returns, calc_rolling_metrics, calc_trend_metrics,
        calc_cross_sectional_rank, calc_momentum_score,
        aggregate_sub_industry,
    )
    from pipeline.writer import (
        upsert_daily_sub_returns, upsert_daily_stock_returns,
    )

    logger.info(f"  Processing date: {target_date}")

    # 找到 target_date 對應的 price index 位置
    close_dates = close_all.index.normalize()
    target_ts = np.datetime64(target_date)
    date_mask = close_dates <= target_ts

    if not date_mask.any():
        logger.warning(f"  No price data for {target_date}")
        return {"success": 0, "failed": 0, "date": str(target_date)}

    # 截取到 target_date 的價格
    close_to_date = close_all[date_mask]
    volume_to_date = volume_all[date_mask] if volume_all is not None else None
    high_to_date   = high_all[date_mask]   if high_all  is not None else None
    low_to_date    = low_all[date_mask]    if low_all   is not None else None

    # SPY 截取到 target_date
    spy_to_date = None
    if spy_close is not None:
        spy_mask = spy_close.index.normalize() <= target_ts
        spy_to_date = spy_close[spy_mask] if spy_mask.any() else None

    # 對每個 sub-industry 計算
    from pipeline.universe import get_sub_industry_mapping
    sub_mapping = get_sub_industry_mapping(universe_df)

    # 建立 gics_code 對應表
    gics_records_map = {}
    for rec in universe_df.to_dict("records"):
        sub = rec["sub_industry"]
        if sub not in gics_records_map:
            import hashlib
            code_raw = f"{rec['sector']}_{sub}"
            gics_code = hashlib.md5(code_raw.encode()).hexdigest()[:8].upper()
            gics_records_map[sub] = gics_code

    # 第一遍：計算所有 sub-industry 的基礎指標
    sub_metrics = {}
    for sub_industry, tickers in sub_mapping.items():
        gics_code = gics_records_map.get(sub_industry)
        if not gics_code:
            continue

        metrics = aggregate_sub_industry(
            tickers, close_to_date,
            volume_to_date if volume_to_date is not None else close_to_date,
            spy_close=spy_to_date,
            high_all=high_to_date,
            low_all=low_to_date,
        )
        if metrics:
            sub_metrics[gics_code] = {
                "sub_industry": sub_industry,
                **metrics,
            }

    if not sub_metrics:
        logger.warning(f"  No metrics computed for {target_date}")
        return {"success": 0, "failed": 1, "date": str(target_date)}

    # 截面計算：動能分數和排名
    all_ret1m = [v.get("ret_1m") for v in sub_metrics.values()]
    all_ret3m = [v.get("ret_3m") for v in sub_metrics.values()]
    all_ret6m = [v.get("ret_6m") for v in sub_metrics.values()]

    mom_scores = {
        gc: calc_momentum_score(
            v.get("ret_3m"), v.get("ret_6m"), all_ret3m, all_ret6m
        )
        for gc, v in sub_metrics.items()
    }

    ranks = calc_cross_sectional_rank(mom_scores)

    # 截面計算 momentum_decay_rate（1M 百分位 - 3M 百分位）
    from pipeline.calculator import (calc_momentum_decay_rate,
                                      calc_breadth_adjusted_momentum)
    from scipy import stats as _stats

    def _percentile(val, all_vals):
        clean = [v for v in all_vals if v is not None and not np.isnan(v)]
        if not clean or val is None:
            return 50.0
        mn = np.mean(clean)
        std = np.std(clean, ddof=1) if len(clean) > 1 else 1e-8
        if std == 0:
            return 50.0
        return float(_stats.norm.cdf((val - mn) / std) * 100)

    for gc, metrics in sub_metrics.items():
        score_3m = _percentile(metrics.get("ret_3m"), all_ret3m)
        score_1m = _percentile(metrics.get("ret_1m"), all_ret1m)
        metrics['momentum_decay_rate'] = calc_momentum_decay_rate(score_3m, score_1m)
        metrics['breadth_adj_mom'] = calc_breadth_adjusted_momentum(
            metrics.get("ret_3m"), metrics.get("breadth_pct")
        )

    # 組裝最終 records
    records = []
    for gics_code, metrics in sub_metrics.items():
        rank_today = ranks.get(gics_code)
        rank_prev = prev_ranks.get(gics_code)
        delta_rank = (rank_prev - rank_today
                      if rank_today and rank_prev else None)

        record = {
            "date":           str(target_date),
            "gics_code":      gics_code,
            "mom_score":      mom_scores.get(gics_code),
            "rank_today":     rank_today,
            "rank_prev_week": rank_prev,
            "delta_rank":     delta_rank,
            "stock_count":    metrics.get("stock_count", 0),
        }

        # 合入所有指標
        for key in ["ret_1d", "ret_1w", "ret_1m", "ret_3m",
                    "ret_6m", "ret_12m", "mom_6m", "mom_12m",
                    "obv_trend", "rvol", "vol_mom", "pv_divergence",
                    "sharpe_8w", "sortino_8w", "win_rate_8w", "volatility_8w", "skewness",
                    "information_ratio", "momentum_decay_rate", "breadth_adj_mom",
                    "downside_capture", "calmar_ratio", "rs_trend_slope",
                    "leader_lagger_ratio", "cmf", "mfi", "vrsi", "pvt_slope",
                    "vol_surge_score", "beta", "momentum_autocorr",
                    "price_trend_r2", "ad_slope"]:
            record[key] = metrics.get(key)

        records.append(record)

    # Upsert sub-industry
    success, failed = upsert_daily_sub_returns(supabase, records)

    # ── 個股指標 ──────────────────────────────────────────────
    from pipeline.calculator import calc_returns
    from pipeline.volume import calc_rvol

    stock_records = []
    for sub_industry, tickers in sub_mapping.items():
        gics_code = gics_records_map.get(sub_industry)
        if not gics_code:
            continue

        ticker_rets = {}
        for t in tickers:
            if t not in close_to_date.columns:
                continue
            close_s = close_to_date[t].dropna()
            if close_s.empty:
                continue
            ticker_rets[t] = calc_returns(close_s)

        # 在 sub-industry 內按 ret_3m 排名
        ret3m_vals = {t: r["ret_3m"] for t, r in ticker_rets.items()
                      if r.get("ret_3m") is not None}
        ranked = sorted(ret3m_vals, key=ret3m_vals.get, reverse=True)
        rank_map = {t: i + 1 for i, t in enumerate(ranked)}

        for t, rets in ticker_rets.items():
            if volume_to_date is not None and t in volume_to_date.columns:
                vol_s = volume_to_date[t].dropna()
                rvol = calc_rvol(vol_s) if not vol_s.empty else None
            else:
                rvol = None

            stock_records.append({
                "date":        str(target_date),
                "ticker":      t,
                "gics_code":   gics_code,
                "ret_1d":      rets.get("ret_1d"),
                "ret_1w":      rets.get("ret_1w"),
                "ret_1m":      rets.get("ret_1m"),
                "ret_3m":      rets.get("ret_3m"),
                "rank_in_sub": rank_map.get(t),
                "rvol":        rvol,
                "mom_score":   None,
                "obv_trend":   None,
            })

    if stock_records:
        s2, f2 = upsert_daily_stock_returns(supabase, stock_records)
        logger.info(f"  Stock records: {s2} upserted, {f2} failed")

    return {"success": success, "failed": failed, "date": str(target_date)}


def main():
    parser = argparse.ArgumentParser(description="Momentum Portal Pipeline")
    parser.add_argument("--backfill", action="store_true",
                        help="回填過去 N 年的歷史資料（首次執行用）")
    parser.add_argument("--years", type=int, default=1,
                        help="回填年數（預設 1 年，即約 252 個交易日）")
    args = parser.parse_args()

    start_time = time.time()
    logger.info("=" * 60)
    logger.info("Momentum Portal Pipeline Starting")
    logger.info(f"Date: {date.today()}")
    logger.info("=" * 60)

    # 1. 匯入模組
    from pipeline.universe import fetch_sp1500_universe, get_gics_universe_records
    from pipeline.fetcher import fetch_prices, fetch_spy_prices, is_market_open_today, HISTORY_DAYS
    from pipeline.writer import (
        init_supabase, upsert_gics_universe, upsert_stock_universe,
        check_today_exists, get_prev_week_ranks,
    )

    # 2. 非交易日跳過（backfill 模式不跳過）
    if not args.backfill and not is_market_open_today():
        logger.info("Not a trading day. Exiting.")
        sys.exit(0)

    # 3. 初始化 Supabase
    try:
        supabase = init_supabase()
        logger.info("Supabase client initialized")
    except Exception as e:
        logger.error(f"Failed to connect to Supabase: {e}")
        sys.exit(1)

    # 4. 一般模式：檢查是否已跑過今天
    force_rerun = os.environ.get("FORCE_RERUN", "false").lower() == "true"
    if not args.backfill and not force_rerun:
        if check_today_exists(supabase):
            logger.info("Today's data already exists. Use FORCE_RERUN=true to override.")
            sys.exit(0)

    # 5. 抓取 S&P 1500 成分股
    logger.info("Fetching S&P 1500 universe from Wikipedia...")
    try:
        universe_df = fetch_sp1500_universe()
        logger.info(f"Universe: {len(universe_df)} stocks, "
                    f"{universe_df['sub_industry'].nunique()} sub-industries")
    except Exception as e:
        logger.error(f"Failed to fetch universe: {e}")
        sys.exit(1)

    # 6. Upsert universe 靜態資料
    import hashlib

    # 建立 sub_industry → gics_code 的權威對照表（以 drop_duplicates 後的 sector 為準）
    import pandas as pd
    gics_deduped = (
        universe_df[["sector", "sub_industry"]]
        .drop_duplicates(subset=["sub_industry"])
        .reset_index(drop=True)
    )
    sub_to_gics_code: dict = {}
    for _, r in gics_deduped.iterrows():
        code = hashlib.md5(f"{r['sector']}_{r['sub_industry']}".encode()).hexdigest()[:8].upper()
        sub_to_gics_code[r["sub_industry"]] = code

    gics_records = get_gics_universe_records(universe_df)
    upsert_gics_universe(supabase, gics_records)

    stock_records = []
    for _, row in universe_df.iterrows():
        gics_code = sub_to_gics_code.get(row["sub_industry"])
        if not gics_code:
            continue
        stock_records.append({
            "ticker":       row["ticker"],
            "company":      row.get("company", ""),
            "gics_code":    gics_code,
            "index_member": row.get("index_member", ""),
            "is_active":    True,
        })
    upsert_stock_universe(supabase, stock_records)

    # 7. 下載價格
    logger.info("Downloading price data...")
    tickers = universe_df["ticker"].tolist()
    # backfill 時需要足夠多的歷史股價，否則舊日期沒有資料
    price_history_days = (args.years * 365 + 100) if args.backfill else HISTORY_DAYS
    try:
        close_all, volume_all, high_all, low_all = fetch_prices(tickers, history_days=price_history_days)
        spy_close = fetch_spy_prices(history_days=price_history_days)
        logger.info(f"Downloaded: {close_all.shape[1]} tickers, "
                    f"{close_all.shape[0]} days")
    except Exception as e:
        logger.error(f"Failed to download prices: {e}")
        sys.exit(1)

    # 8. 取上週排名（計算 delta_rank 用）
    prev_ranks = get_prev_week_ranks(supabase)
    logger.info(f"Previous week ranks loaded: {len(prev_ranks)} entries")

    # 9. 執行計算
    total_success, total_failed = 0, 0

    if args.backfill:
        # ── Backfill 模式：回填過去 N 年 ──────────────────────
        target_days = args.years * 252
        logger.info(f"BACKFILL MODE: processing past {args.years} year(s) (~{target_days} trading days)...")
        trading_dates = []
        # 掃描足夠多的日曆天以覆蓋目標交易日數（每年約 365 個日曆天）
        for i in range(args.years * 365 + 60):
            d = date.today() - timedelta(days=i)
            if d.weekday() < 5:  # 週一到週五
                trading_dates.append(d)
            if len(trading_dates) >= target_days:
                break

        trading_dates.reverse()  # 從最舊到最新
        logger.info(f"Backfill: {len(trading_dates)} trading days to process")

        # 估算 daily_stock_returns 資料量警告（~1,500 rows/天 × 0.5KB ≈ ~750KB/天）
        estimated_mb = len(trading_dates) * 1500 * 512 / 1024 / 1024
        if estimated_mb > 400:
            logger.warning(f"WARNING: Estimated daily_stock_returns size ~{estimated_mb:.0f}MB, "
                           "approaching Supabase 500MB limit. Consider checking DB usage.")

        for i, target_date in enumerate(trading_dates):
            logger.info(f"Backfill [{i + 1}/{len(trading_dates)}] {target_date}")
            result = run_pipeline_for_date(
                target_date, universe_df, close_all, volume_all,
                spy_close, supabase, prev_ranks,
                high_all=high_all, low_all=low_all,
            )
            total_success += result["success"]
            total_failed += result["failed"]
            time.sleep(0.1)  # 避免 Supabase rate limit

    else:
        # ── 一般模式：只跑今天 ────────────────────────────────
        result = run_pipeline_for_date(
            date.today(), universe_df, close_all, volume_all,
            spy_close, supabase, prev_ranks,
            high_all=high_all, low_all=low_all,
        )
        total_success += result["success"]
        total_failed += result["failed"]

    # 10. 執行摘要
    elapsed = time.time() - start_time
    logger.info("=" * 60)
    logger.info("Pipeline Complete")
    logger.info(f"  Success: {total_success} sub-industry records")
    logger.info(f"  Failed:  {total_failed} sub-industry records")
    logger.info(f"  Time:    {elapsed:.1f} seconds")
    logger.info("=" * 60)

    total_records = total_success + total_failed
    fail_rate = total_failed / total_records if total_records > 0 else 0
    if fail_rate > 0.20:
        logger.error(f"Failure rate {fail_rate:.1%} exceeds 20% threshold — exiting with error")
        sys.exit(1)
    elif total_failed > 0:
        logger.warning(f"Minor failures ({total_failed} records, {fail_rate:.1%}) — likely rate limiting, data still usable")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.exception(f"Unhandled exception: {e}")
        sys.exit(1)
