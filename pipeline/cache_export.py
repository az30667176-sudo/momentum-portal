"""
cache_export.py
Pipeline 最後一步：把回測所需資料序列化為 gzipped JSON 快照，
上傳到 Supabase Storage。前端直接下載（~200ms），
取代即時 DB 查詢（5-15s），徹底消除 thundering-herd 504 timeout。

快照檔案：
  sub-history.json.gz         — 全量 daily_sub_returns（~15MB gzip）
  stock-history-rp5.json.gz   — 週頻再平衡的個股資料
  stock-history-rp10.json.gz  — 雙週頻
  stock-history-rp20.json.gz  — 月頻
  stock-history-rp40.json.gz  — 雙月頻
"""

import gzip
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

BUCKET = 'backtest-cache'
FILE_PATH = 'sub-history.json.gz'

# 標準再平衡週期（對應前端 UI 選項）
STANDARD_REBAL_PERIODS = [5, 10, 20, 40]

STOCK_COLS = ','.join([
    'date', 'ticker', 'gics_code',
    'ret_1d', 'ret_1w', 'ret_1m', 'ret_3m',
    'mom_score', 'rank_in_sub', 'rvol', 'obv_trend',
])

# 只匯出 backtestEngine.ts 實際用到的欄位，跳過大量 NULL 的新指標
EXPORT_COLS = ','.join([
    'date', 'gics_code', 'rank_today', 'stock_count',
    'ret_1d', 'ret_1w', 'ret_1m', 'ret_3m', 'ret_6m', 'ret_12m', 'mom_6m',
    'mom_score', 'obv_trend', 'rvol', 'vol_mom', 'vol_surge_score',
    'sharpe_8w', 'sortino_8w', 'volatility_8w', 'calmar_ratio',
    'information_ratio', 'momentum_decay_rate',
    'downside_capture', 'leader_lagger_ratio', 'cmf',
    'beta', 'momentum_autocorr', 'price_trend_r2',
    'price_vs_ma5', 'price_vs_ma20', 'price_vs_ma100', 'price_vs_ma200',
    'breadth_20ma', 'breadth_50ma', 'high_proximity',
])

CHUNK = 10_000  # 每批最多 10K rows（Python pipeline 沒有 60s 限制，用 OFFSET 分頁沒問題）


def export_backtest_cache(supabase_client) -> bool:
    """
    從 daily_sub_returns 匯出全量 sub history，壓縮後上傳到 Supabase Storage。
    前端 backtestEngine.ts 優先下載此檔取代即時 DB 查詢。

    Returns True on success, False on failure (non-fatal, pipeline still continues).
    """
    try:
        logger.info("[cache_export] 開始匯出 backtest sub-history 快照...")

        # ── 1. 分頁抓取全量 sub history ──────────────────────────
        all_rows: list[dict] = []
        offset = 0
        while True:
            result = (
                supabase_client
                .table('daily_sub_returns')
                .select(EXPORT_COLS)
                .order('date')
                .range(offset, offset + CHUNK - 1)
                .execute()
            )
            batch = result.data or []
            all_rows.extend(batch)
            if len(batch) < CHUNK:
                break
            offset += CHUNK

        if not all_rows:
            logger.warning("[cache_export] daily_sub_returns 無資料，跳過匯出")
            return False

        # ── 2. 抓 gics_universe（155 rows，快）────────────────────
        gics_result = (
            supabase_client
            .table('gics_universe')
            .select('gics_code,sector,industry_group,industry,sub_industry,etf_proxy')
            .execute()
        )
        gics_map = {g['gics_code']: g for g in (gics_result.data or [])}

        # ── 3. 序列化 + 壓縮 ─────────────────────────────────────
        snapshot = {
            'built_at': datetime.utcnow().isoformat() + 'Z',
            'row_count': len(all_rows),
            'rows': all_rows,
            'gics': gics_map,
        }
        compressed = gzip.compress(
            json.dumps(snapshot, default=str).encode('utf-8'),
            compresslevel=6,
        )
        size_kb = len(compressed) / 1024
        logger.info(
            f"[cache_export] {len(all_rows)} rows → {size_kb:.0f} KB (gzip)"
        )

        # ── 4. 確保 bucket 存在 ──────────────────────────────────
        try:
            supabase_client.storage.create_bucket(BUCKET, {'public': False})
            logger.info(f"[cache_export] 建立 Storage bucket: {BUCKET}")
        except Exception:
            pass  # 已存在

        # ── 5. 上傳（先刪舊檔再上傳，確保 upsert）──────────────
        bucket = supabase_client.storage.from_(BUCKET)
        try:
            bucket.remove([FILE_PATH])
        except Exception:
            pass
        bucket.upload(FILE_PATH, compressed, {'content-type': 'application/gzip'})

        logger.info(
            f"[cache_export] ✓ 已上傳 {FILE_PATH} → '{BUCKET}' bucket ({size_kb:.0f} KB)"
        )

        # ── 6. 匯出各再平衡週期的個股快照 ────────────────────────
        sub_dates = sorted({str(r['date'])[:10] for r in all_rows})
        export_stock_history_snapshots(supabase_client, sub_dates)

        return True

    except Exception as e:
        logger.error(f"[cache_export] 匯出失敗（非致命）: {e}")
        return False


def _collect_rebal_dates(all_dates: list, rebal_period: int) -> list:
    """與 TypeScript collectRebalDates 相同邏輯：每 rebal_period 天取一個日期。"""
    rebal_dates = []
    next_rebal = 0
    for i, d in enumerate(all_dates):
        if i >= next_rebal:
            rebal_dates.append(d)
            next_rebal = i + rebal_period
    return rebal_dates


def _upload(bucket, file_path: str, data: bytes) -> None:
    try:
        bucket.remove([file_path])
    except Exception:
        pass
    bucket.upload(file_path, data, {'content-type': 'application/gzip'})


def export_stock_history_snapshots(supabase_client, sub_dates: list) -> None:
    """
    為各標準再平衡週期建立個股快照，上傳到 Storage。
    前端 fetchStockHistoryByRebalPeriod 會先嘗試下載這些檔案，
    命中後 ~200ms，取代 ~10s 的逐批 DB 查詢。
    """
    bucket = supabase_client.storage.from_(BUCKET)
    DATE_BATCH = 30  # 每次 .in_() 查詢的日期數（30 dates × 1500 stocks = 45K rows，夠快）

    for rp in STANDARD_REBAL_PERIODS:
        try:
            rebal_dates = _collect_rebal_dates(sub_dates, rp)
            logger.info(f"[cache_export] stock rp={rp}: {len(rebal_dates)} rebal dates")

            all_rows: list = []
            for i in range(0, len(rebal_dates), DATE_BATCH):
                batch = rebal_dates[i:i + DATE_BATCH]
                result = (
                    supabase_client
                    .table('daily_stock_returns')
                    .select(STOCK_COLS)
                    .in_('date', batch)
                    .order('date')
                    .order('ticker')
                    .execute()
                )
                all_rows.extend(result.data or [])

            compressed = gzip.compress(
                json.dumps({'rows': all_rows}, default=str).encode('utf-8'),
                compresslevel=6,
            )
            size_kb = len(compressed) / 1024
            file_path = f'stock-history-rp{rp}.json.gz'
            _upload(bucket, file_path, compressed)
            logger.info(
                f"[cache_export] ✓ stock rp={rp}: {len(all_rows)} rows, "
                f"{size_kb:.0f} KB → {file_path}"
            )

        except Exception as e:
            logger.error(f"[cache_export] stock rp={rp} 失敗（非致命）: {e}")
