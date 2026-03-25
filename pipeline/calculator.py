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
    spy_close: pd.Series = None,
    prev_rvols: list[float] = None,
    high_all: pd.DataFrame = None,
    low_all: pd.DataFrame = None,
) -> dict:
    """
    對一個 sub-industry 的所有成分股等權平均，計算所有指標。

    Parameters
    ----------
    tickers : list[str]
        該 sub-industry 的成分股清單
    close_all, volume_all : pd.DataFrame
        全市場收盤價和成交量（columns = ticker）
    spy_close : pd.Series, optional
        SPY 收盤價（用於 IR、Downside Capture、Beta）
    prev_rvols : list[float], optional
        過去數週的 RVol 序列（用於 Vol Surge Score）
    high_all, low_all : pd.DataFrame, optional
        全市場最高/最低價（用於 CMF、MFI、A/D Slope）

    Returns
    -------
    dict
        包含所有報酬、風險和量化指標，以及 stock_count
    """
    from pipeline.volume import (calc_obv_trend, calc_rvol,
                                  calc_vol_momentum, calc_pv_divergence,
                                  calc_chaikin_money_flow, calc_money_flow_index,
                                  calc_volume_weighted_rsi, calc_ad_slope,
                                  calc_pvt_slope, calc_vol_surge_score)

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
            vol_entry = {
                "obv_trend": calc_obv_trend(close, volume),
                "rvol":      calc_rvol(volume),
                "vol_mom":   calc_vol_momentum(volume),
                "pv_div":    calc_pv_divergence(close, volume),
            }
            has_hl = (high_all is not None and low_all is not None
                      and t in high_all.columns and t in low_all.columns)
            if has_hl:
                high = high_all[t].dropna()
                low  = low_all[t].dropna()
                vol_entry["cmf"]       = calc_chaikin_money_flow(high, low, close, volume)
                vol_entry["mfi"]       = calc_money_flow_index(high, low, close, volume)
                vol_entry["vrsi"]      = calc_volume_weighted_rsi(close, volume)
                vol_entry["ad_slope"]  = calc_ad_slope(high, low, close, volume)
                vol_entry["pvt_slope"] = calc_pvt_slope(close, volume)
            else:
                for k in ["cmf", "mfi", "vrsi", "ad_slope", "pvt_slope"]:
                    vol_entry[k] = None
            vol_results.append(vol_entry)

    # 等權平均所有數值指標（報酬類）
    all_keys = set()
    for r in ret_results:
        all_keys.update(r.keys())

    result = {}
    for key in all_keys:
        vals = [r.get(key) for r in ret_results if r.get(key) is not None]
        result[key] = round(float(np.nanmean(vals)), 4) if vals else None

    # 量價指標等權平均
    if vol_results:
        for vk in ["obv_trend", "rvol", "vol_mom",
                   "cmf", "mfi", "vrsi", "ad_slope", "pvt_slope"]:
            vals = [v[vk] for v in vol_results if v.get(vk) is not None]
            result[vk] = round(float(np.nanmean(vals)), 4) if vals else None

        # pv_divergence：取眾數
        pvs = [v["pv_div"] for v in vol_results if v.get("pv_div")]
        if pvs:
            from collections import Counter
            result["pv_divergence"] = Counter(pvs).most_common(1)[0][0]

    result["stock_count"] = len(valid)

    # ── 建立等權聚合週報酬序列 ────────────────────────────────
    close_sub = close_all[valid]
    daily_rets_full = close_sub.pct_change()
    aligned_dates = daily_rets_full.dropna(how='all').index
    n_weeks = len(aligned_dates) // 5

    sub_weekly: list[float] = []
    spy_weekly: list[float] = []

    spy_daily_all = spy_close.pct_change() if spy_close is not None else None

    for i in range(n_weeks):
        week_dates = aligned_dates[i * 5:(i + 1) * 5]
        week_data = daily_rets_full.reindex(week_dates)
        eq_daily = week_data.mean(axis=1).dropna()
        if len(eq_daily) == 0:
            continue
        week_ret = float((1 + eq_daily).prod() - 1) * 100
        sub_weekly.append(week_ret)

        if spy_daily_all is not None:
            spy_wk = spy_daily_all.reindex(week_dates).dropna()
            spy_weekly.append(
                float((1 + spy_wk).prod() - 1) * 100 if len(spy_wk) > 0 else 0.0
            )

    n_common = min(len(sub_weekly), len(spy_weekly))
    sw = sub_weekly[-n_common:] if n_common > 0 else sub_weekly
    bw = spy_weekly[-n_common:] if n_common > 0 else []

    # ── 新增指標 ──────────────────────────────────────────────
    if bw:
        excess = [s - b for s, b in zip(sw, bw)]
        result['information_ratio'] = calc_information_ratio(excess)
        result['downside_capture']  = calc_downside_capture(sw, bw)
        result['beta']              = calc_beta(sw, bw)
    else:
        result['information_ratio'] = None
        result['downside_capture']  = None
        result['beta']              = None

    result['calmar_ratio']      = calc_calmar_ratio(sub_weekly)
    result['momentum_autocorr'] = calc_momentum_autocorrelation(sub_weekly)

    # Rolling risk metrics (8-week window)
    rolling = calc_rolling_metrics(sub_weekly[-8:] if len(sub_weekly) >= 8 else sub_weekly)
    result.update(rolling)

    # Price Trend R²（等權價格指數）
    eq_price_rets = close_sub.pct_change().mean(axis=1).dropna()
    price_index = (1 + eq_price_rets).cumprod() * 100
    result['price_trend_r2'] = calc_price_trend_r2(price_index)

    # Leader / Lagger Ratio
    ticker_rets_20d = {
        t: close_all[t].pct_change().dropna().iloc[-20:].tolist()
        for t in valid
    }
    result['leader_lagger_ratio'] = calc_leader_lagger_ratio(ticker_rets_20d)

    # RS Trend Slope：需要歷史序列，由外部傳入後補算
    result['rs_trend_slope'] = None

    # Vol Surge Score
    result['vol_surge_score'] = calc_vol_surge_score(prev_rvols or [])

    return result


# ─── 進階量化指標 ──────────────────────────────────────────────

def calc_information_ratio(weekly_excess_returns: list[float]) -> float | None:
    """
    IR = 超額週報酬均值 / 超額週報酬標準差 × sqrt(52)
    超額報酬 = sub-industry 週報酬 - SPY 同期週報酬
    >= 0.5 動能可靠，< 0 跑輸大盤
    """
    if not weekly_excess_returns or len(weekly_excess_returns) < 4:
        return None
    arr = np.array(weekly_excess_returns, dtype=float)
    mn = np.nanmean(arr)
    std = np.nanstd(arr, ddof=1)
    if std < 1e-8:
        return None
    return round(float(mn / std * np.sqrt(52)), 4)


def calc_momentum_decay_rate(score_3m: float | None, score_1m: float | None) -> float | None:
    """
    = mom_score_1m - mom_score_3m
    正數=動能加速，負數=動能衰退（出場預警）
    """
    if score_3m is None or score_1m is None:
        return None
    return round(float(score_1m - score_3m), 2)


def calc_breadth_adjusted_momentum(ret_3m: float | None, breadth_pct: float | None) -> float | None:
    """
    = ret_3m × (breadth_pct / 100)
    懲罰少數股票撐盤的假動能
    """
    if ret_3m is None or breadth_pct is None:
        return None
    return round(float(ret_3m * breadth_pct / 100), 4)


def calc_downside_capture(weekly_sub: list[float], weekly_spy: list[float]) -> float | None:
    """
    只取 SPY 為負的週，計算 sub 平均下跌 / SPY 平均下跌
    <= 0.7 防禦強，> 1.0 高 beta
    """
    if not weekly_sub or not weekly_spy:
        return None
    n = min(len(weekly_sub), len(weekly_spy))
    sub = np.array(weekly_sub[-n:], dtype=float)
    spy = np.array(weekly_spy[-n:], dtype=float)
    down = spy < 0
    if not np.any(down):
        return 1.0
    spy_avg = np.nanmean(spy[down])
    sub_avg = np.nanmean(sub[down])
    if abs(spy_avg) < 1e-8:
        return None
    return round(float(sub_avg / spy_avg), 4)


def calc_calmar_ratio(weekly_returns: list[float], weeks: int = 12) -> float | None:
    """
    = 年化週報酬(mean × 52) / abs(最差單週報酬)
    """
    if not weekly_returns or len(weekly_returns) < 4:
        return None
    arr = np.array(weekly_returns[-weeks:], dtype=float)
    ann_ret = np.nanmean(arr) * 52
    max_dd = abs(np.nanmin(arr))
    if max_dd < 1e-8:
        return None
    return round(float(ann_ret / max_dd), 4)


def calc_rs_trend_slope(rs_history: list[float], lookback: int = 4) -> float | None:
    """
    對最近 lookback 筆 rs_ratio 做線性迴歸取斜率
    正數=RS 正在建立，負數=RS 正在弱化
    """
    if not rs_history or len(rs_history) < lookback:
        return None
    recent = np.array(rs_history[-lookback:], dtype=float)
    x = np.arange(len(recent))
    try:
        slope = np.polyfit(x, recent, 1)[0]
        return round(float(slope), 6)
    except Exception:
        return None


def calc_leader_lagger_ratio(ticker_returns_20d: dict) -> float | None:
    """
    leaders = 近 5 天均報酬 > 近 20 天均報酬 的 ticker 數
    > 2.0 健康輪動，< 0.5 少數股撐盤
    """
    leaders, laggers = 0, 0
    for ticker, rets in ticker_returns_20d.items():
        if not rets or len(rets) < 5:
            continue
        arr = np.array(rets, dtype=float)
        avg = np.nanmean(arr)
        recent = np.nanmean(arr[-5:])
        if recent > avg:
            leaders += 1
        else:
            laggers += 1
    if laggers == 0:
        return float(leaders) if leaders > 0 else None
    return round(float(leaders / laggers), 4)


def calc_beta(weekly_sub: list[float], weekly_spy: list[float]) -> float | None:
    """
    Beta = cov(sub, spy) / var(spy)
    <= 0.8 獨立強勢，> 1.2 高度跟隨大盤
    """
    if not weekly_sub or not weekly_spy or len(weekly_sub) < 12:
        return None
    n = min(len(weekly_sub), len(weekly_spy))
    sub = np.array(weekly_sub[-n:], dtype=float)
    spy = np.array(weekly_spy[-n:], dtype=float)
    try:
        cov_matrix = np.cov(sub, spy)
        var_spy = cov_matrix[1][1]
        if var_spy < 1e-10:
            return None
        beta = cov_matrix[0][1] / var_spy
        return round(float(beta), 4)
    except Exception:
        return None


def calc_momentum_autocorrelation(weekly_returns: list[float], lag: int = 1) -> float | None:
    """
    lag-1 自相關係數
    > 0.2 趨勢持續（趨勢策略），< -0.2 均值回歸
    """
    if not weekly_returns or len(weekly_returns) < 8:
        return None
    arr = np.array(weekly_returns, dtype=float)
    try:
        r = np.corrcoef(arr[:-lag], arr[lag:])[0][1]
        return round(float(r), 4)
    except Exception:
        return None


def calc_price_trend_r2(close: pd.Series, lookback_days: int = 63) -> float | None:
    """
    價格對時間的線性迴歸 R²
    >= 0.85 趨勢乾淨，< 0.5 高度震盪
    """
    close = close.dropna()
    if len(close) < 20:
        return None
    n = min(lookback_days, len(close))
    y = close.iloc[-n:].values
    x = np.arange(n)
    try:
        _, _, r, _, _ = stats.linregress(x, y)
        return round(float(r ** 2), 4)
    except Exception:
        return None


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # 快速測試
    import yfinance as yf
    close = yf.download("NVDA", period="2y",
                        auto_adjust=True, progress=False)["Close"].squeeze()
    print(calc_returns(close))
