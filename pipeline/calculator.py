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
        sharpe_8w, sortino_8w, volatility_8w
    """
    if len(weekly_returns) < 4:
        return {k: None for k in ["sharpe_8w", "sortino_8w", "volatility_8w"]}

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

    volatility = std * np.sqrt(52)

    return {
        "sharpe_8w":     round(sharpe, 4),
        "sortino_8w":    round(sortino, 4),
        "volatility_8w": round(volatility, 4),
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


def _zscore_percentile(val: float | None, all_vals: list) -> float:
    """將單一值轉換為截面百分位（0–100）。"""
    clean = [v for v in all_vals if v is not None and not np.isnan(float(v))]
    if not clean or val is None or np.isnan(float(val)):
        return 50.0
    mn = np.mean(clean)
    std = np.std(clean, ddof=1)
    if std < 1e-8:
        return 50.0
    return float(stats.norm.cdf((float(val) - mn) / std) * 100)


def calc_momentum_score(
    ret_1m:            float | None,
    ret_3m:            float | None,
    mom_6m:            float | None,
    price_trend_r2:    float | None,
    momentum_autocorr: float | None,
    information_ratio: float | None,
    all_ret1m:   list,
    all_ret3m:   list,
    all_mom6m:   list,
    all_r2:      list,
    all_autocorr: list,
    all_ir:      list,
) -> float:
    """
    Sub-industry 綜合動能分數（0–100），三維度加權合成：

      50% 報酬動能  = 0.25 × Z(ret_1m) + 0.40 × Z(ret_3m) + 0.35 × Z(mom_6m_skip)
      25% 動能品質  = 0.50 × Z(price_trend_r2) + 0.50 × Z(momentum_autocorr_26w)
      25% 相對強度  = Z(information_ratio_26w)

    Z = 當日截面百分位（所有板塊中的相對位置），結果 0–100。
    各分項缺值時以 50（中性）填補，不因缺資料而懲罰。
    """
    # Component A: multi-horizon momentum (50%)
    p_1m = _zscore_percentile(ret_1m, all_ret1m)
    p_3m = _zscore_percentile(ret_3m, all_ret3m)
    p_6m = _zscore_percentile(mom_6m, all_mom6m)
    comp_a = 0.25 * p_1m + 0.40 * p_3m + 0.35 * p_6m

    # Component B: trend quality (25%)
    p_r2       = _zscore_percentile(price_trend_r2,    all_r2)
    p_autocorr = _zscore_percentile(momentum_autocorr, all_autocorr)
    comp_b = 0.5 * p_r2 + 0.5 * p_autocorr

    # Component C: relative strength vs market (25%)
    comp_c = _zscore_percentile(information_ratio, all_ir)

    return round(0.50 * comp_a + 0.25 * comp_b + 0.25 * comp_c, 2)


def calc_stock_momentum_score(
    ret_1m:    float | None,
    ret_3m:    float | None,
    ret_6m:    float | None,
    all_ret1m: list,
    all_ret3m: list,
    all_ret6m: list,
) -> float:
    """
    個股簡化動能分數（0–100）。
    個股層級缺乏 IR / trend R² 截面資料，採三時間窗口報酬加權。

      0.25 × Z(ret_1m) + 0.40 × Z(ret_3m) + 0.35 × Z(ret_6m)
    """
    p_1m = _zscore_percentile(ret_1m, all_ret1m)
    p_3m = _zscore_percentile(ret_3m, all_ret3m)
    p_6m = _zscore_percentile(ret_6m, all_ret6m)
    return round(0.25 * p_1m + 0.40 * p_3m + 0.35 * p_6m, 2)


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
                                  calc_vol_momentum,
                                  calc_chaikin_money_flow,
                                  calc_vol_surge_score)

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
            }
            has_hl = (high_all is not None and low_all is not None
                      and t in high_all.columns and t in low_all.columns)
            if has_hl:
                high = high_all[t].dropna()
                low  = low_all[t].dropna()
                vol_entry["cmf"] = calc_chaikin_money_flow(high, low, close, volume)
            else:
                vol_entry["cmf"] = None
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
        for vk in ["obv_trend", "rvol", "vol_mom", "cmf"]:
            vals = [v[vk] for v in vol_results if v.get(vk) is not None]
            result[vk] = round(float(np.nanmean(vals)), 4) if vals else None

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
    # 26週窗口：IR 和 autocorr 用固定窗口，確保截面可比性
    W26 = 26
    sw_26 = sw[-W26:] if len(sw) >= W26 else sw
    bw_26 = bw[-W26:] if len(bw) >= W26 else bw

    if bw:
        # information_ratio：固定 26 週窗口，跨板塊截面比較一致
        excess_26 = [s - b for s, b in zip(sw_26, bw_26)]
        result['information_ratio'] = calc_information_ratio(excess_26)
        # downside_capture / beta：保留全歷史（需要足夠樣本才穩定）
        result['downside_capture']  = calc_downside_capture(sw, bw)
        result['beta']              = calc_beta(sw, bw)
    else:
        result['information_ratio'] = None
        result['downside_capture']  = None
        result['beta']              = None

    result['calmar_ratio']      = calc_calmar_ratio(sub_weekly)
    # momentum_autocorr：固定 26 週窗口，跨板塊截面比較一致
    result['momentum_autocorr'] = calc_momentum_autocorrelation(sw_26)

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

    # Vol Surge Score
    result['vol_surge_score'] = calc_vol_surge_score(prev_rvols or [])

    # ── 新指標：均線相對位置、廣度、52週高點 ──────────────────
    result['price_vs_ma5']   = calc_price_vs_ma(price_index, 5)
    result['price_vs_ma20']  = calc_price_vs_ma(price_index, 20)
    result['price_vs_ma100'] = calc_price_vs_ma(price_index, 100)
    result['price_vs_ma200'] = calc_price_vs_ma(price_index, 200)
    result['high_proximity'] = calc_high_proximity(price_index)
    result['breadth_20ma']   = calc_breadth_ma(close_all, valid, 20)
    result['breadth_50ma']   = calc_breadth_ma(close_all, valid, 50)

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


def calc_calmar_ratio(weekly_returns: list[float], weeks: int = 52) -> float | None:
    """
    Calmar = 年化報酬 / 最大回撤（Max Drawdown）
    使用近 52 週週報酬，計算累積曲線的真實最大回撤（峰谷法）
    > 2 優秀，0.5~2 尚可，< 0.5 風險高
    """
    if not weekly_returns or len(weekly_returns) < 4:
        return None
    arr = np.array(weekly_returns[-weeks:], dtype=float)
    ann_ret = float(np.nanmean(arr) * 52)
    # 從週報酬建立累積淨值曲線，計算真實 Max Drawdown
    eq = np.cumprod(1 + arr / 100)
    peak = np.maximum.accumulate(eq)
    drawdowns = (peak - eq) / peak * 100
    max_dd = float(np.nanmax(drawdowns))
    if max_dd < 1e-8:
        return None
    return round(ann_ret / max_dd, 4)


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


def calc_price_vs_ma(price_index: pd.Series, period: int) -> float | None:
    """
    板塊等權價格指數相對於 MA 的偏離百分比。
    = (今日指數 / 近 period 日均值 - 1) × 100
    正數 = 指數在 MA 上方（上升趨勢），負數 = 在 MA 下方（下降趨勢）
    """
    idx = price_index.dropna()
    if len(idx) < period + 1:
        return None
    ma = float(idx.iloc[-period:].mean())
    if ma == 0:
        return None
    return round(float((idx.iloc[-1] / ma - 1) * 100), 4)


def calc_breadth_ma(close_all: pd.DataFrame, tickers: list[str], period: int) -> float | None:
    """
    板塊內個股站上 period 日均線的比例（0–100%）。
    > 70% 板塊健康，< 30% 板塊廣泛走弱。
    用於區分「少數股票撐盤」和「廣泛參與的真動能」。
    """
    above, total = 0, 0
    for t in tickers:
        if t not in close_all.columns:
            continue
        close = close_all[t].dropna()
        if len(close) < period + 1:
            continue
        ma = float(close.iloc[-period:].mean())
        total += 1
        if close.iloc[-1] > ma:
            above += 1
    if total == 0:
        return None
    return round(above / total * 100, 2)


def calc_high_proximity(price_index: pd.Series, lookback: int = 252) -> float | None:
    """
    板塊等權價格指數相對於近 lookback 日最高點的比例。
    = 今日指數 / 近 252 日最高點
    > 0.95 接近突破，= 1.0 創新高，< 0.80 距高點顯著回撤
    """
    idx = price_index.dropna()
    if len(idx) < 5:
        return None
    n = min(lookback, len(idx))
    high = float(idx.iloc[-n:].max())
    if high == 0:
        return None
    return round(float(idx.iloc[-1] / high), 4)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # 快速測試
    import yfinance as yf
    close = yf.download("NVDA", period="2y",
                        auto_adjust=True, progress=False)["Close"].squeeze()
    print(calc_returns(close))
