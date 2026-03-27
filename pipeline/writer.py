"""
writer.py
把計算結果寫入 Supabase，全部用 upsert 確保冪等性
"""

import os
import logging
import time
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

BATCH_SIZE = 200       # 每次 upsert 的最大筆數（200 是安全上限，可減少 roundtrip）
MAX_RETRIES = 3        # 失敗重試次數


_NUMERIC_7_4_MAX = 999.9999  # NUMERIC(7,4) 上限


def _sanitize(records: list[dict]) -> list[dict]:
    """把 float NaN / Inf 換成 None；超出 NUMERIC(7,4) 範圍也換成 None"""
    import math
    cleaned = []
    for row in records:
        new_row = {}
        for k, v in row.items():
            if isinstance(v, float):
                if not math.isfinite(v) or abs(v) > _NUMERIC_7_4_MAX:
                    new_row[k] = None
                else:
                    new_row[k] = v
            else:
                new_row[k] = v
        cleaned.append(new_row)
    return cleaned


def init_supabase() -> Client:
    """建立 Supabase client"""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")

    if not url or not key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment. "
            "Check your .env file."
        )

    return create_client(url, key)


def _upsert_with_retry(supabase: Client, table: str,
                        records: list[dict],
                        on_conflict: str) -> tuple[int, int]:
    """
    帶 retry 的 upsert，回傳 (成功筆數, 失敗筆數)
    """
    success, failed = 0, 0

    # 分批處理
    batches = [records[i:i + BATCH_SIZE]
               for i in range(0, len(records), BATCH_SIZE)]

    for batch_idx, batch in enumerate(batches):
        batch = _sanitize(batch)
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                result = (supabase.table(table)
                          .upsert(batch, on_conflict=on_conflict)
                          .execute())
                success += len(batch)
                logger.debug(f"  Batch {batch_idx + 1}: "
                             f"upserted {len(batch)} rows into {table}")
                break
            except Exception as e:
                if attempt < MAX_RETRIES:
                    wait = 2 ** attempt
                    logger.warning(f"  Upsert attempt {attempt} failed: {e}. "
                                   f"Retrying in {wait}s...")
                    time.sleep(wait)
                else:
                    logger.error(f"  All {MAX_RETRIES} attempts failed "
                                 f"for batch {batch_idx + 1}: {e}")
                    failed += len(batch)
        # Brief pause between batches to avoid Supabase rate limiting
        if len(batches) > 1:
            time.sleep(0.05)

    return success, failed


def upsert_gics_universe(supabase: Client,
                          records: list[dict]) -> None:
    """
    Upsert GICS sub-industry 靜態清單到 gics_universe table。
    on_conflict = gics_code
    """
    if not records:
        return
    success, failed = _upsert_with_retry(
        supabase, "gics_universe", records, "gics_code")
    logger.info(f"gics_universe: {success} upserted, {failed} failed")


def upsert_stock_universe(supabase: Client,
                           records: list[dict]) -> None:
    """
    Upsert 成分股清單到 stock_universe table。
    on_conflict = ticker
    """
    if not records:
        return
    success, failed = _upsert_with_retry(
        supabase, "stock_universe", records, "ticker")
    logger.info(f"stock_universe: {success} upserted, {failed} failed")


def upsert_daily_sub_returns(supabase: Client,
                              records: list[dict]) -> tuple[int, int]:
    """
    Upsert 每日 sub-industry 指標到 daily_sub_returns table。
    on_conflict = (date, gics_code)

    Returns
    -------
    tuple[int, int]
        (成功筆數, 失敗筆數)
    """
    if not records:
        return 0, 0
    success, failed = _upsert_with_retry(
        supabase, "daily_sub_returns", records, "date,gics_code")
    logger.info(f"daily_sub_returns: {success} upserted, {failed} failed")
    return success, failed


def upsert_daily_stock_returns(supabase: Client,
                                records: list[dict]) -> tuple[int, int]:
    """
    Upsert 每日個股指標到 daily_stock_returns table。
    on_conflict = (date, ticker)
    """
    if not records:
        return 0, 0
    success, failed = _upsert_with_retry(
        supabase, "daily_stock_returns", records, "date,ticker")
    logger.info(f"daily_stock_returns: {success} upserted, {failed} failed")
    return success, failed


def check_today_exists(supabase: Client) -> bool:
    """
    檢查今天的 daily_sub_returns 資料是否已存在。
    """
    from datetime import date
    today = date.today().isoformat()
    try:
        result = (supabase.table("daily_sub_returns")
                  .select("date")
                  .eq("date", today)
                  .limit(1)
                  .execute())
        return len(result.data) > 0
    except Exception as e:
        logger.warning(f"Could not check today's data: {e}")
        return False


def get_prev_week_ranks(supabase: Client) -> dict:
    """
    查詢上週的排名資料，用於計算 delta_rank。

    Returns
    -------
    dict
        {gics_code: rank_today}（上週的）
    """
    try:
        # 查最近有資料的日期（不包含今天）
        from datetime import date, timedelta
        cutoff = (date.today() - timedelta(days=1)).isoformat()
        result = (supabase.table("daily_sub_returns")
                  .select("date")
                  .lt("date", cutoff)
                  .order("date", desc=True)
                  .limit(1)
                  .execute())

        if not result.data:
            return {}

        prev_date = result.data[0]["date"]
        ranks_result = (supabase.table("daily_sub_returns")
                        .select("gics_code, rank_today")
                        .eq("date", prev_date)
                        .execute())

        return {r["gics_code"]: r["rank_today"]
                for r in ranks_result.data
                if r.get("rank_today")}

    except Exception as e:
        logger.warning(f"Could not fetch prev week ranks: {e}")
        return {}
