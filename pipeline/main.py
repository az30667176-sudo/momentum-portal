"""
main.py
Pipeline 主程式：整合所有模組，每日執行一次

執行方式：
  python pipeline/main.py           # 一般執行
  python pipeline/main.py --backfill  # 首次執行回填 52 週歷史
  FORCE_RERUN=true python pipeline/main.py  # 強制重跑今天
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
            volume_to_date if volume_to_date is not None else close_to_date
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
    all_ret3m = [v.get("ret_3m") for v in sub_metrics.values()]
    all_ret6m = [v.get("ret_6m") for v in sub_metrics.values()]

    mom_scores = {
        gc: calc_momentum_score(
            v.get("ret_3m"), v.get("ret_6m"), all_ret3m, all_ret6m
        )
        for gc, v in sub_metrics.items()
    }

    ranks = calc_cross_sectional_rank(mom_scores)

    # 組裝最終 records
    records = []
    for gics_code, metrics in sub_metrics.items():
        rank_today = ranks.get(gics_code)
        rank_prev = prev_ranks.get(gics_code)
        delta_rank = (rank_prev - rank_today
                      if rank_today and rank_prev else None)

        record = {
            "date":         str(target_date),
            "gics_code":    gics_code,
            "mom_score":    mom_scores.get(gics_code),
            "rank_today":   rank_today,
            "rank_prev_week": rank_prev,
            "delta_rank":   delta_rank,
            "stock_count":  metrics.get("stock_count", 0),
        }

        # 合入所有指標
        for key in ["ret_1d", "ret_1w", "ret_1m", "ret_3m",
                    "ret_6m", "ret_12m", "mom_6m", "mom_12m",
                    "obv_trend", "rvol", "vol_mom", "pv_divergence"]:
            record[key] = metrics.get(key)

        records.append(record)

    # Upsert
    success, failed = upsert_daily_sub_returns(supabase, records)
    return {"success": success, "failed": failed, "date": str(target_date)}


def main():
    parser = argparse.ArgumentParser(description="Momentum Portal Pipeline")
    parser.add_argument("--backfill", action="store_true",
                        help="回填過去 52 週的歷史資料（首次執行用）")
    args = parser.parse_args()

    start_time = time.time()
    logger.info("=" * 60)
    logger.info("Momentum Portal Pipeline Starting")
    logger.info(f"Date: {date.today()}")
    logger.info("=" * 60)

    # 1. 匯入模組
    from pipeline.universe import fetch_sp1500_universe, get_gics_universe_records
    from pipeline.fetcher import fetch_prices, fetch_spy_prices, is_market_open_today
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
    try:
        close_all, volume_all = fetch_prices(tickers)
        spy_close = fetch_spy_prices()
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
        # ── Backfill 模式：回填過去 52 週 ──────────────────────
        logger.info("BACKFILL MODE: processing past 52 weeks...")
        trading_dates = []
        for i in range(365):
            d = date.today() - timedelta(days=i)
            if d.weekday() < 5:  # 週一到週五
                trading_dates.append(d)
            if len(trading_dates) >= 260:  # 約 52 週
                break

        trading_dates.reverse()  # 從最舊到最新

        for i, target_date in enumerate(trading_dates):
            logger.info(f"Backfill [{i + 1}/{len(trading_dates)}] {target_date}")
            result = run_pipeline_for_date(
                target_date, universe_df, close_all, volume_all,
                spy_close, supabase, prev_ranks,
            )
            total_success += result["success"]
            total_failed += result["failed"]
            time.sleep(0.1)  # 避免 Supabase rate limit

    else:
        # ── 一般模式：只跑今天 ────────────────────────────────
        result = run_pipeline_for_date(
            date.today(), universe_df, close_all, volume_all,
            spy_close, supabase, prev_ranks,
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

    if total_failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.exception(f"Unhandled exception: {e}")
        sys.exit(1)
