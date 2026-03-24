"""
calculator.py
計算所有量化指標：報酬、動能分數、風險指標、排名
"""

import numpy as np
import pandas as pd
import logging
from scipy import stats

logger = logging.getLogger(__name__)


# ─── 報酬計算 ────────────────────────────────────────────────

def calc_returns(close: pd.Series) -> dict:
    """
    計算多個時間窗口的報酬率（百分比）。
    mom_6m / mom_12m 採用 skip-month 設計（跳過最近 22 個交易日）。

    Parameters
    ----------
    close : pd.Series
        個股收盤價，index 為日期，需至少 252 個交易日

    Returns
    -------
    dict
        ret_1d, ret_1w, ret_1m, ret_3m, ret_6m, ret_12m,
        mom_6m, mom_12m（均為百分比）
    """
    close = close.dropna()
    n = len(close)
    today = close.iloc[-1]

    def ret(lookback: int) -> float | None:
        if n < lookback + 1:
            return None
        past = close.iloc[-lookback - 1]
        if past == 0:
            return None
        return (today / past - 1) * 100

    result = {
        "ret_1d":  ret(1),
        "ret_1w":  ret(5),
        "ret_1m":  ret(21),
        "ret_3m":  ret(63),
        "ret_6m":  ret(126),
        "ret_12m": ret(252),
    }

    # Skip-month momentum：用 t-22 的價格作為起點，跳過短期反轉帶
    if n >= 132:
        base_6m  = close.iloc[-132]
        skip_ref = close.iloc[-22]
        result["mom_6m"] = (skip_ref / base_6m - 1) * 100 if base_6m > 0 else None
    else:
        result["mom_6m"] = None

    if n >= 252:
        base_12m = close.iloc[-252]
        skip_ref = close.iloc[-22] if n >= 22 else close.iloc[-1]
        result["mom_12m"] = (skip_ref / base_12m - 1) * 100 if base_12m > 0 else None
    else:
        result["mom_12m"] = None

    return result


# ─── 滾動風險指標 ─────────────────────────────────────────────

def calc_rolling_metrics(weekly_returns: list[float]) -> dict:
    """
    計算滾動 8 週的風險調整指標。

    Parameters
    ----------
    weekly_returns : list[float]
        近 8 週的週報酬率（百分比）

    Returns
    -------
    dict
        sharpe_8w, sortino_8w, win_rate_8w, volatility_8w, skewness
    """
    if len(weekly_returns) < 4:
        return {k: None for k in
                ["sharpe_8w", "sortino_8w", "win_rate_8w",
                 "volatility_8w", "skewness"]}

    wr = np.array(weekly_returns, dtype=float)
    mn = np.nanmean(wr)
    std = np.nanstd(wr, ddof=1)
    if std == 0:
        std = 1e-8

    # Sharpe（年化）
    sharpe = (mn / std) * np.sqrt(52)

    # Sortino（只用下行標準差）
    downside = wr[wr < 0]
    ds = np.std(downside, ddof=1) if len(downside) > 1 else std
    sortino = (mn / ds) * np.sqrt(52) if ds > 0 else 0.0

    win_rate = np.sum(wr > 0) / len(wr) * 100
    volatility = std * np.sqrt(52)

    try:
        skew = float(stats.skew(wr))
    except Exception:
        skew = 0.0

    return {
        "sharpe_8w":    round(sharpe, 4),
        "sortino_8w":   round(sortino, 4),
        "win_rate_8w":  round(win_rate, 2),
        "volatility_8w": round(volatility, 4),
        "skewness":     round(skew, 4),
    }


# ─── 趨勢指標 ────────────────────────────────────────────────

def calc_trend_metrics(weekly_ranks: list[int], total: int = 145) -> dict:
    """
    計算排名走勢相關指標。

    Parameters
    ----------
    weekly_ranks : list[int]
        過去最多 52 週的排名（1 = 最強）
    total : int
        sub-industry 總數

    Returns
    -------
    dict
        trend_r2, acceleration, max_rank_dd,
        consistency_8w, top25_freq, annual_return
    """
    if len(weekly_ranks) < 4:
        return {k: None for k in
                ["trend_r2", "acceleration", "max_rank_dd",
                 "consistency_8w", "top25_freq"]}

    rk = np.array(weekly_ranks, dtype=float)
    n = len(rk)

    # 線性趨勢 R²
    x = np.arange(n)
    try:
        slope, intercept, r, _, _ = stats.linregress(x, rk)
        r2 = float(r ** 2)
    except Exception:
        r2 = 0.0

    # Acceleration：後 4 週均排名 vs 前 4 週均排名（負數 = 改善）
    if n >= 8:
        accel = float(np.mean(rk[-8:-4]) - np.mean(rk[-4:]))
    else:
        accel = 0.0

    # Max Rank Drawdown（排名從低點回升的最大幅度，以位置計）
    peak = rk[0]
    max_dd = 0
    for r_val in rk:
        if r_val < peak:
            peak = r_val
        dd = r_val - peak
        if dd > max_dd:
            max_dd = dd

    # Consistency：近 8 週在前 1/3 的次數
    top_threshold = total // 3
    last8 = rk[-8:]
    consistency = int(np.sum(last8 <= top_threshold))

    # Top 25% 頻率（全年）
    top25 = total // 4
    top25_freq = float(np.sum(rk <= top25) / n * 100)

    return {
        "trend_r2":     round(r2, 4),
        "acceleration": round(accel, 2),
        "max_rank_dd":  int(max_dd),
        "consistency_8w": consistency,
        "top25_freq":   round(top25_freq, 2),
    }


# ─── 截面排名 & 動能分數 ──────────────────────────────────────

def calc_cross_sectional_rank(scores: dict) -> dict:
    """
    對所有 sub-industry 的分數做截面排名。

    Parameters
    ----------
    scores : dict
        {gics_code: score_value}

    Returns
    -------
    dict
        {gics_code: rank}，1 = 最強
    """
    if not scores:
        return {}
    items = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return {gics_code: rank + 1 for rank, (gics_code, _) in enumerate(items)}


def calc_momentum_score(ret_3m: float | None,
                        ret_6m: float | None,
                        all_ret3m: list[float],
                        all_ret6m: list[float]) -> float:
    """
    計算 0-100 的綜合動能分數。
    公式：0.5 × Z(ret_3m) + 0.5 × Z(ret_6m)，轉換到 0-100。

    Parameters
    ----------
    ret_3m, ret_6m : float | None
        該 sub-industry 的 3M / 6M 報酬
    all_ret3m, all_ret6m : list[float]
        全部 145 個 sub-industry 的對應值（截面計算用）
    """
    def zscore_percentile(val, all_vals):
        clean = [v for v in all_vals if v is not None and not np.isnan(v)]
        if not clean or val is None:
            return 50.0
        mn = np.mean(clean)
        std = np.std(clean, ddof=1)
        if std == 0:
            return 50.0
        z = (val - mn) / std
        # 轉換到 0-100（norm CDF）
        return float(stats.norm.cdf(z) * 100)

    p3m = zscore_percentile(ret_3m, all_ret3m)
    p6m = zscore_percentile(ret_6m, all_ret6m)
    return round(0.5 * p3m + 0.5 * p6m, 2)


# ─── Sub-industry 等權聚合 ────────────────────────────────────

def aggregate_sub_industry(
    tickers: list[str],
    close_all: pd.DataFrame,
    volume_all: pd.DataFrame,
) -> dict:
    """
    對一個 sub-industry 的所有成分股等權平均，計算所有指標。

    Parameters
    ----------
    tickers : list[str]
        該 sub-industry 的成分股清單
    close_all, volume_all : pd.DataFrame
        全市場收盤價和成交量（columns = ticker）

    Returns
    -------
    dict
        包含所有報酬和風險指標，以及 stock_count
    """
    from pipeline.volume import (calc_obv_trend, calc_rvol,
                                  calc_vol_momentum, calc_pv_divergence)

    valid = [t for t in tickers if t in close_all.columns
             and not close_all[t].dropna().empty]

    if not valid:
        logger.warning(f"  No valid tickers in sub-industry: {tickers[:3]}")
        return {}

    ret_results, vol_results = [], []

    for t in valid:
        close = close_all[t].dropna()
        volume = volume_all[t].dropna() if t in volume_all.columns else pd.Series()

        ret_results.append(calc_returns(close))

        if not volume.empty:
            vol_results.append({
                "obv_trend": calc_obv_trend(close, volume),
                "rvol":      calc_rvol(volume),
                "vol_mom":   calc_vol_momentum(volume),
                "pv_div":    calc_pv_divergence(close, volume),
            })

    # 等權平均所有數值指標
    all_keys = set()
    for r in ret_results:
        all_keys.update(r.keys())

    result = {}
    for key in all_keys:
        vals = [r.get(key) for r in ret_results
                if r.get(key) is not None]
        result[key] = round(float(np.nanmean(vals)), 4) if vals else None

    # 量價指標等權平均
    if vol_results:
        for vk in ["obv_trend", "rvol", "vol_mom"]:
            vals = [v[vk] for v in vol_results
                    if v.get(vk) is not None]
            result[vk] = round(float(np.nanmean(vals)), 4) if vals else None

        # pv_divergence：取眾數
        pvs = [v["pv_div"] for v in vol_results if v.get("pv_div")]
        if pvs:
            from collections import Counter
            result["pv_divergence"] = Counter(pvs).most_common(1)[0][0]

    result["stock_count"] = len(valid)
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # 快速測試
    import yfinance as yf
    close = yf.download("NVDA", period="2y",
                        auto_adjust=True, progress=False)["Close"].squeeze()
    print(calc_returns(close))
