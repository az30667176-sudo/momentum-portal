"""
fetcher.py
用 yfinance 批次下載股價和成交量資料
"""

import yfinance as yf
import pandas as pd
import numpy as np
import time
import logging
from datetime import datetime, timedelta, date

logger = logging.getLogger(__name__)

BATCH_SIZE = 50         # 每批 ticker 數（太大容易被限流）
SLEEP_BETWEEN = 2.0     # 批次間暫停秒數
HISTORY_DAYS = 420      # 抓 420 天保留計算空間（52 週 + buffer）

# 美國主要假日（月-日格式，不含年份）
US_HOLIDAYS = {
    "01-01",  # New Year's Day
    "07-04",  # Independence Day
    "12-25",  # Christmas
    "11-11",  # Veterans Day
}


def is_market_open_today() -> bool:
    """
    判斷今天是否是美股交易日。
    簡化判斷：週一到週五，且不是主要假日。
    """
    today = date.today()
    if today.weekday() >= 5:  # 週六=5, 週日=6
        logger.info(f"Today is {today.strftime('%A')}, market closed.")
        return False

    mmdd = today.strftime("%m-%d")
    if mmdd in US_HOLIDAYS:
        logger.info(f"Today ({mmdd}) is a US holiday, market closed.")
        return False

    return True


def fetch_prices(tickers: list[str]) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    批次下載所有 ticker 的收盤價、成交量、最高價和最低價。

    Parameters
    ----------
    tickers : list[str]
        股票代碼清單

    Returns
    -------
    tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]
        (close_df, volume_df, high_df, low_df)
        index = 日期，columns = ticker
    """
    end = datetime.today()
    start = end - timedelta(days=HISTORY_DAYS)

    batches = [tickers[i:i + BATCH_SIZE]
               for i in range(0, len(tickers), BATCH_SIZE)]

    all_close, all_volume, all_high, all_low = [], [], [], []
    failed_tickers = []

    for i, batch in enumerate(batches):
        logger.info(f"Batch {i + 1}/{len(batches)}: "
                    f"downloading {len(batch)} tickers...")
        try:
            raw = yf.download(
                batch,
                start=start,
                end=end,
                auto_adjust=True,
                progress=False,
                threads=True,
            )

            if raw.empty:
                logger.warning(f"  Batch {i + 1}: empty result")
                failed_tickers.extend(batch)
                continue

            # 單一 ticker 時 columns 結構不同
            if len(batch) == 1:
                close  = raw[["Close"]].rename(columns={"Close": batch[0]})
                volume = raw[["Volume"]].rename(columns={"Volume": batch[0]})
                high   = raw[["High"]].rename(columns={"High": batch[0]})
                low    = raw[["Low"]].rename(columns={"Low": batch[0]})
            else:
                lvl0 = raw.columns.get_level_values(0)
                close  = raw["Close"]  if "Close"  in lvl0 else raw.xs("Close",  axis=1, level=0)
                volume = raw["Volume"] if "Volume" in lvl0 else raw.xs("Volume", axis=1, level=0)
                high   = raw["High"]   if "High"   in lvl0 else raw.xs("High",   axis=1, level=0)
                low    = raw["Low"]    if "Low"    in lvl0 else raw.xs("Low",    axis=1, level=0)

            all_close.append(close)
            all_volume.append(volume)
            all_high.append(high)
            all_low.append(low)
            logger.info(f"  → OK: {close.shape[1]} tickers, "
                        f"{close.shape[0]} days")

        except Exception as e:
            logger.error(f"  Batch {i + 1} failed: {e}")
            failed_tickers.extend(batch)

        time.sleep(SLEEP_BETWEEN)

    if not all_close:
        raise RuntimeError("All batches failed. Check network or yfinance version.")

    close_df  = pd.concat(all_close,  axis=1)
    volume_df = pd.concat(all_volume, axis=1)
    high_df   = pd.concat(all_high,   axis=1)
    low_df    = pd.concat(all_low,    axis=1)

    # 移除全 NaN 欄位（以 close 為基準）
    close_df  = close_df.dropna(how="all", axis=1)
    volume_df = volume_df.reindex(columns=close_df.columns)
    high_df   = high_df.reindex(columns=close_df.columns)
    low_df    = low_df.reindex(columns=close_df.columns)

    # ── 補抓批次下載遺漏的 tickers ───────────────────────────
    all_expected = set(tickers)
    downloaded = set(close_df.columns.tolist())
    missing = list(all_expected - downloaded)

    if missing:
        logger.warning(f"Batch download missed {len(missing)} tickers, "
                       f"retrying individually: {missing[:10]}...")
        recovered_close, recovered_volume = [], []
        recovered_high,  recovered_low    = [], []
        for t in missing:
            try:
                raw = yf.download(
                    t,
                    start=start,
                    end=end,
                    auto_adjust=True,
                    progress=False,
                )
                if raw.empty or "Close" not in raw.columns:
                    logger.warning(f"  {t}: no data from yfinance")
                    failed_tickers.append(t)
                    continue
                c = raw[["Close"]].rename(columns={"Close": t})
                v = raw[["Volume"]].rename(columns={"Volume": t})
                h = raw[["High"]].rename(columns={"High": t})
                l = raw[["Low"]].rename(columns={"Low": t})
                if c[t].dropna().empty:
                    logger.warning(f"  {t}: all-NaN close series")
                    failed_tickers.append(t)
                    continue
                recovered_close.append(c)
                recovered_volume.append(v)
                recovered_high.append(h)
                recovered_low.append(l)
                logger.info(f"  {t}: recovered ({len(c.dropna())} days)")
                time.sleep(0.5)
            except Exception as e:
                logger.warning(f"  {t}: individual download failed: {e}")
                failed_tickers.append(t)

        if recovered_close:
            close_df  = pd.concat([close_df,  pd.concat(recovered_close,  axis=1)], axis=1)
            volume_df = pd.concat([volume_df, pd.concat(recovered_volume, axis=1)], axis=1)
            high_df   = pd.concat([high_df,   pd.concat(recovered_high,   axis=1)], axis=1)
            low_df    = pd.concat([low_df,    pd.concat(recovered_low,    axis=1)], axis=1)
            logger.info(f"Recovered {len(recovered_close)} tickers individually")

    if failed_tickers:
        logger.warning(f"Permanently failed tickers ({len(failed_tickers)}): "
                       f"{failed_tickers[:20]}...")

    logger.info(f"Download complete: {close_df.shape[1]} tickers, "
                f"{close_df.shape[0]} days")
    return close_df, volume_df, high_df, low_df


def fetch_spy_prices() -> pd.Series:
    """
    抓取 SPY 收盤價作為 benchmark。

    Returns
    -------
    pd.Series
        index = 日期，values = 收盤價
    """
    end = datetime.today()
    start = end - timedelta(days=HISTORY_DAYS)
    raw = yf.download("SPY", start=start, end=end,
                      auto_adjust=True, progress=False)
    return raw["Close"].squeeze()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    print(f"Market open today: {is_market_open_today()}")
    close, vol = fetch_prices(["AAPL", "MSFT", "NVDA", "TSLA"])
    print(close.tail(3))
