"""
fetcher.py
用 yfinance 批次下載股價和成交量資料。

快取策略
--------
所有 OHLCV 資料以 MultiIndex Parquet 存在 data/prices.parquet。
- 首次執行（無快取）：下載最近 CACHE_MAX_DAYS 天
- 之後每次：只下載快取最新日期之後的增量資料（通常 1–5 天）
- fetch_prices_cached() 是主入口；fetch_prices() 保留作備用直接下載
"""

import yfinance as yf
import pandas as pd
import numpy as np
import time
import logging
from datetime import datetime, timedelta, date
from pathlib import Path

logger = logging.getLogger(__name__)

BATCH_SIZE     = 50      # 每批 ticker 數
SLEEP_BETWEEN  = 2.0     # 批次間暫停秒數
HISTORY_DAYS   = 420     # 非快取模式的預設天數
CACHE_MAX_DAYS = 900     # 快取保留天數（約 3.5 年，足夠 200MA + 12M 報酬）

# 快取檔案路徑：momentum-portal/data/prices.parquet
CACHE_FILE = Path(__file__).resolve().parent.parent / "data" / "prices.parquet"

# 美國主要假日
US_HOLIDAYS = {"01-01", "07-04", "12-25", "11-11"}


def is_market_open_today() -> bool:
    today = date.today()
    if today.weekday() >= 5:
        logger.info(f"Today is {today.strftime('%A')}, market closed.")
        return False
    mmdd = today.strftime("%m-%d")
    if mmdd in US_HOLIDAYS:
        logger.info(f"Today ({mmdd}) is a US holiday, market closed.")
        return False
    return True


# ── 快取讀寫 ──────────────────────────────────────────────────

def load_price_cache(cache_file: Path = CACHE_FILE) -> dict | None:
    """
    從 Parquet 讀取快取，回傳 {'close', 'volume', 'high', 'low', 'open'} dict。
    快取不存在或損壞時回傳 None。
    """
    if not cache_file.exists():
        logger.info(f"[cache] 無快取檔案：{cache_file}")
        return None
    try:
        df = pd.read_parquet(cache_file)
        fields = df.columns.get_level_values(0).unique().tolist()
        result: dict[str, pd.DataFrame] = {}
        for f in ['close', 'volume', 'high', 'low', 'open']:
            result[f] = df[f] if f in fields else pd.DataFrame(index=df.index)
        latest = result['close'].index.max()
        latest_str = latest.date() if pd.notna(latest) else 'N/A'
        logger.info(
            f"[cache] 已載入 {result['close'].shape[1]} 檔，"
            f"{len(df)} 天，最新日期：{latest_str}"
        )
        return result
    except Exception as e:
        logger.warning(f"[cache] 讀取失敗（{e}），將重新下載")
        return None


def save_price_cache(
    close_df: pd.DataFrame,
    volume_df: pd.DataFrame,
    high_df: pd.DataFrame,
    low_df: pd.DataFrame,
    open_df: pd.DataFrame | None = None,
    cache_file: Path = CACHE_FILE,
) -> None:
    """將 OHLCV DataFrame 存成 MultiIndex Parquet 快取。"""
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    frames: dict[str, pd.DataFrame] = {
        'close': close_df,
        'volume': volume_df,
        'high': high_df,
        'low': low_df,
    }
    if open_df is not None and not open_df.empty:
        frames['open'] = open_df

    combined = pd.concat(frames, axis=1)
    # 只保留最新 CACHE_MAX_DAYS 天
    if len(combined) > CACHE_MAX_DAYS:
        combined = combined.iloc[-CACHE_MAX_DAYS:]

    combined.to_parquet(cache_file, compression='snappy')
    size_mb = cache_file.stat().st_size / 1024 / 1024
    logger.info(
        f"[cache] 已儲存 {len(combined)} 天 × {close_df.shape[1]} 檔 "
        f"→ {cache_file.name} ({size_mb:.1f} MB)"
    )


# ── 核心下載（內部使用）────────────────────────────────────────

def _download_ohlcv(
    tickers: list[str],
    history_days: int,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    從 yfinance 批次下載 OHLCV（含 Open）。
    回傳 (close, volume, high, low, open)，index = 日期，columns = ticker。
    """
    end   = datetime.today()
    start = end - timedelta(days=history_days)
    logger.info(
        f"下載 {start.date()} → {end.date()}（{history_days} 日曆天，"
        f"{len(tickers)} 檔）"
    )

    batches = [tickers[i:i + BATCH_SIZE] for i in range(0, len(tickers), BATCH_SIZE)]
    all_close, all_volume, all_high, all_low, all_open = [], [], [], [], []
    failed_tickers: list[str] = []

    for i, batch in enumerate(batches):
        logger.info(f"  批次 {i + 1}/{len(batches)}：下載 {len(batch)} 檔...")
        try:
            raw = yf.download(
                batch, start=start, end=end,
                auto_adjust=True, progress=False, threads=True,
            )
            if raw.empty:
                logger.warning(f"  批次 {i + 1}：空結果")
                failed_tickers.extend(batch)
                continue

            if len(batch) == 1:
                t = batch[0]
                close  = raw[["Close"]].rename(columns={"Close":  t})
                volume = raw[["Volume"]].rename(columns={"Volume": t})
                high   = raw[["High"]].rename(columns={"High":   t})
                low    = raw[["Low"]].rename(columns={"Low":    t})
                open_  = raw[["Open"]].rename(columns={"Open":   t})
            else:
                lvl0   = raw.columns.get_level_values(0)
                close  = raw["Close"]  if "Close"  in lvl0 else raw.xs("Close",  axis=1, level=0)
                volume = raw["Volume"] if "Volume" in lvl0 else raw.xs("Volume", axis=1, level=0)
                high   = raw["High"]   if "High"   in lvl0 else raw.xs("High",   axis=1, level=0)
                low    = raw["Low"]    if "Low"    in lvl0 else raw.xs("Low",    axis=1, level=0)
                open_  = raw["Open"]   if "Open"   in lvl0 else raw.xs("Open",   axis=1, level=0)

            all_close.append(close);  all_volume.append(volume)
            all_high.append(high);    all_low.append(low)
            all_open.append(open_)
            logger.info(f"  → OK：{close.shape[1]} 檔，{close.shape[0]} 天")

        except Exception as e:
            logger.error(f"  批次 {i + 1} 失敗：{e}")
            failed_tickers.extend(batch)

        time.sleep(SLEEP_BETWEEN)

    if not all_close:
        raise RuntimeError("所有批次均失敗，請檢查網路或 yfinance 版本。")

    close_df  = pd.concat(all_close,  axis=1).dropna(how="all", axis=1)
    volume_df = pd.concat(all_volume, axis=1).reindex(columns=close_df.columns)
    high_df   = pd.concat(all_high,   axis=1).reindex(columns=close_df.columns)
    low_df    = pd.concat(all_low,    axis=1).reindex(columns=close_df.columns)
    open_df   = pd.concat(all_open,   axis=1).reindex(columns=close_df.columns)

    # 補抓批次遺漏的 ticker
    missing = list(set(tickers) - set(close_df.columns))
    if missing:
        logger.warning(f"批次遺漏 {len(missing)} 檔，逐一補抓：{missing[:10]}...")
        rec_c, rec_v, rec_h, rec_l, rec_o = [], [], [], [], []
        for t in missing:
            try:
                raw = yf.download(t, start=start, end=end,
                                  auto_adjust=True, progress=False)
                if raw.empty or "Close" not in raw.columns:
                    continue
                c = raw[["Close"]].rename(columns={"Close": t})
                if c[t].dropna().empty:
                    continue
                rec_c.append(c)
                rec_v.append(raw[["Volume"]].rename(columns={"Volume": t}))
                rec_h.append(raw[["High"]].rename(columns={"High": t}))
                rec_l.append(raw[["Low"]].rename(columns={"Low": t}))
                rec_o.append(raw[["Open"]].rename(columns={"Open": t}))
                logger.info(f"  {t}：補回（{len(c.dropna())} 天）")
                time.sleep(0.5)
            except Exception as e:
                logger.warning(f"  {t}：補抓失敗（{e}）")

        if rec_c:
            close_df  = pd.concat([close_df,  pd.concat(rec_c, axis=1)], axis=1)
            volume_df = pd.concat([volume_df, pd.concat(rec_v, axis=1)], axis=1)
            high_df   = pd.concat([high_df,   pd.concat(rec_h, axis=1)], axis=1)
            low_df    = pd.concat([low_df,    pd.concat(rec_l, axis=1)], axis=1)
            open_df   = pd.concat([open_df,   pd.concat(rec_o, axis=1)], axis=1)

    if failed_tickers:
        logger.warning(f"永久失敗 {len(failed_tickers)} 檔：{failed_tickers[:20]}")
    logger.info(f"下載完成：{close_df.shape[1]} 檔，{close_df.shape[0]} 天")
    return close_df, volume_df, high_df, low_df, open_df


# ── 主入口：帶快取的增量下載 ──────────────────────────────────

def fetch_prices_cached(
    tickers: list[str],
    cache_file: Path = CACHE_FILE,
    force_full: bool = False,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    增量下載：載入快取 → 只下載新天數 → 合併 → 存快取。
    回傳 (close, volume, high, low, open)。

    force_full=True 時忽略快取，重新下載 CACHE_MAX_DAYS 天（首次建立用）。
    """
    cache = None if force_full else load_price_cache(cache_file)
    today = datetime.today().date()

    if cache is not None:
        latest = cache['close'].index.max()
        latest_date = latest.date() if pd.notna(latest) else None
        days_needed = (today - latest_date).days + 5 if latest_date else CACHE_MAX_DAYS

        if days_needed <= 1:
            logger.info("[cache] 已是最新，無需下載")
            return (
                cache['close'], cache['volume'],
                cache['high'],  cache['low'],
                cache.get('open', pd.DataFrame()),
            )

        logger.info(f"[cache] 快取至 {latest_date}，下載最新 {days_needed} 天增量")
        close_n, vol_n, high_n, low_n, open_n = _download_ohlcv(tickers, days_needed + 10)

        def _merge(old: pd.DataFrame, new: pd.DataFrame) -> pd.DataFrame:
            if old is None or old.empty:
                return new
            merged = pd.concat([old, new], axis=0)
            # 同一天以新資料為準（處理後來的除權調整）
            return merged[~merged.index.duplicated(keep='last')].sort_index()

        close_df  = _merge(cache['close'],  close_n)
        volume_df = _merge(cache['volume'], vol_n)
        high_df   = _merge(cache['high'],   high_n)
        low_df    = _merge(cache['low'],    low_n)
        open_df   = _merge(cache.get('open'), open_n)
    else:
        logger.info("[cache] 無快取，下載完整歷史...")
        close_df, volume_df, high_df, low_df, open_df = _download_ohlcv(
            tickers, CACHE_MAX_DAYS
        )

    # 對齊至當前 S&P 1500 名單（成分股可能有進出）
    keep = sorted(set(tickers) & set(close_df.columns))
    close_df  = close_df[keep]
    volume_df = volume_df.reindex(columns=keep)
    high_df   = high_df.reindex(columns=keep)
    low_df    = low_df.reindex(columns=keep)
    if not open_df.empty:
        open_df = open_df.reindex(columns=keep)

    save_price_cache(close_df, volume_df, high_df, low_df, open_df, cache_file=cache_file)
    return close_df, volume_df, high_df, low_df, open_df


# ── 備用：不使用快取的直接下載（向後相容）────────────────────

def fetch_prices(
    tickers: list[str],
    history_days: int = HISTORY_DAYS,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    直接下載（不用快取）。回傳 (close, volume, high, low)。
    保留供需要強制重下或測試使用。
    """
    close_df, volume_df, high_df, low_df, _ = _download_ohlcv(tickers, history_days)
    return close_df, volume_df, high_df, low_df


def fetch_spy_prices(history_days: int = HISTORY_DAYS) -> pd.Series:
    """抓取 SPY 收盤價作為 benchmark。"""
    end   = datetime.today()
    start = end - timedelta(days=history_days)
    raw   = yf.download("SPY", start=start, end=end,
                        auto_adjust=True, progress=False)
    return raw["Close"].squeeze()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    print(f"Market open today: {is_market_open_today()}")
    c, v, h, l, o = fetch_prices_cached(["AAPL", "MSFT", "NVDA", "TSLA"])
    print(c.tail(3))
