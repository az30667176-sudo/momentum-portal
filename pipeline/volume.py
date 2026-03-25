"""
volume.py
量價分析指標：OBV Trend、Relative Volume、Volume Momentum、Price-Volume Divergence
"""

import numpy as np
import pandas as pd
import logging

logger = logging.getLogger(__name__)


def calc_obv_trend(close: pd.Series, volume: pd.Series,
                   lookback: int = 8) -> float | None:
    """
    計算 OBV（On-Balance Volume）的近期線性斜率。

    正斜率 = 成交量流入（看漲）
    負斜率 = 成交量流出（看跌）

    Parameters
    ----------
    close : pd.Series
        收盤價
    volume : pd.Series
        成交量
    lookback : int
        計算斜率用的天數（預設 8 週 × 5 天 = 40 天）

    Returns
    -------
    float | None
        OBV 斜率（已標準化，單位：每天變化的 OBV 量）
    """
    try:
        # 對齊 index
        df = pd.concat([close, volume], axis=1).dropna()
        df.columns = ["close", "volume"]

        if len(df) < lookback + 5:
            return None

        # 計算 OBV
        direction = np.sign(df["close"].diff()).fillna(0)
        obv = (direction * df["volume"]).cumsum()

        # 取近 lookback 天的斜率
        recent_obv = obv.iloc[-lookback:]
        x = np.arange(len(recent_obv))

        if np.std(recent_obv) == 0:
            return 0.0

        slope = np.polyfit(x, recent_obv.values, 1)[0]

        # 標準化：除以近期平均成交量，讓不同股票可比
        avg_vol = df["volume"].iloc[-lookback:].mean()
        normalized_slope = slope / avg_vol if avg_vol > 0 else slope

        return round(float(normalized_slope), 6)

    except Exception as e:
        logger.debug(f"OBV trend calc failed: {e}")
        return None


def calc_rvol(volume: pd.Series, window: int = 20) -> float | None:
    """
    計算相對成交量（Relative Volume）。
    RVol = 當日成交量 / 過去 N 日平均成交量

    > 1.5 = 爆量，值得注意
    < 0.7 = 量縮，成交清淡

    Parameters
    ----------
    volume : pd.Series
        成交量
    window : int
        均量計算窗口（預設 20 日）

    Returns
    -------
    float | None
        RVol 比率
    """
    try:
        vol = volume.dropna()
        if len(vol) < window + 1:
            return None

        current_vol = vol.iloc[-1]
        avg_vol = vol.iloc[-window - 1:-1].mean()

        if avg_vol == 0:
            return None

        return round(float(current_vol / avg_vol), 4)

    except Exception as e:
        logger.debug(f"RVol calc failed: {e}")
        return None


def calc_vol_momentum(volume: pd.Series,
                      recent_weeks: int = 4,
                      prior_weeks: int = 4) -> float | None:
    """
    計算成交量動能：近期均量 vs 前期均量的比率。
    > 1.2 = 成交量擴張（資金加速流入）
    < 0.85 = 成交量萎縮（資金撤退）

    Parameters
    ----------
    volume : pd.Series
        成交量
    recent_weeks, prior_weeks : int
        近期 / 前期的週數

    Returns
    -------
    float | None
        Volume Momentum 比率
    """
    try:
        vol = volume.dropna()
        days_recent = recent_weeks * 5
        days_prior = prior_weeks * 5
        total_needed = days_recent + days_prior

        if len(vol) < total_needed:
            return None

        recent_avg = vol.iloc[-days_recent:].mean()
        prior_avg = vol.iloc[-total_needed:-days_recent].mean()

        if prior_avg == 0:
            return None

        return round(float(recent_avg / prior_avg), 4)

    except Exception as e:
        logger.debug(f"Vol momentum calc failed: {e}")
        return None


def calc_pv_divergence(close: pd.Series,
                        volume: pd.Series,
                        lookback_days: int = 10) -> str:
    """
    判斷量價背離類型。

    四種情形：
    - "confirmed"     ：量增價漲，資金確認
    - "price_vol_neg" ：量縮價漲，注意假突破
    - "capitulation"  ：量增價跌，可能洗盤/底部
    - "weak"          ：量縮價跌，趨勢疲弱

    Parameters
    ----------
    close : pd.Series
        收盤價
    volume : pd.Series
        成交量
    lookback_days : int
        判斷用的天數

    Returns
    -------
    str
        四種類型之一
    """
    try:
        df = pd.concat([close, volume], axis=1).dropna()
        df.columns = ["close", "volume"]

        if len(df) < lookback_days * 2:
            return "weak"

        recent = df.iloc[-lookback_days:]
        prior = df.iloc[-lookback_days * 2:-lookback_days]

        # 價格方向：近期收益率
        price_return = (recent["close"].iloc[-1] /
                        recent["close"].iloc[0] - 1)
        price_up = price_return > 0.005  # 0.5% 的緩衝，避免噪音

        # 成交量方向：近期均量 vs 前期均量
        recent_vol_avg = recent["volume"].mean()
        prior_vol_avg = prior["volume"].mean()
        vol_up = recent_vol_avg > prior_vol_avg * 1.1  # 10% 的緩衝

        if price_up and vol_up:
            return "confirmed"
        elif price_up and not vol_up:
            return "price_vol_neg"
        elif not price_up and vol_up:
            return "capitulation"
        else:
            return "weak"

    except Exception as e:
        logger.debug(f"PV divergence calc failed: {e}")
        return "weak"


# ─── 進階資金流指標 ───────────────────────────────────────────

def calc_chaikin_money_flow(high, low, close, volume, period=20) -> float | None:
    """
    CMF = sum(MFV, period) / sum(volume, period)
    結果 -1 到 +1，>= 0.1 資金流入，<= -0.1 資金流出
    """
    try:
        df = pd.concat([high, low, close, volume], axis=1).dropna()
        df.columns = ['h', 'l', 'c', 'v']
        if len(df) < period:
            return None
        hl = (df['h'] - df['l']).replace(0, np.nan)
        mfm = ((df['c'] - df['l']) - (df['h'] - df['c'])) / hl
        mfv = mfm * df['v']
        vol_sum = df['v'].iloc[-period:].sum()
        if vol_sum == 0:
            return None
        cmf = mfv.iloc[-period:].sum() / vol_sum
        return round(float(cmf), 4)
    except Exception:
        return None


def calc_money_flow_index(high, low, close, volume, period=14) -> float | None:
    """
    MFI = 100 - (100 / (1 + pos_mf_sum / neg_mf_sum))
    0-100，> 80 超買，< 20 超賣
    """
    try:
        df = pd.concat([high, low, close, volume], axis=1).dropna()
        df.columns = ['h', 'l', 'c', 'v']
        if len(df) < period + 1:
            return None
        tp = (df['h'] + df['l'] + df['c']) / 3
        rmf = tp * df['v']
        tp_diff = tp.diff()
        pos_sum = rmf.where(tp_diff > 0, 0).iloc[-period:].sum()
        neg_sum = rmf.where(tp_diff < 0, 0).iloc[-period:].sum()
        if neg_sum == 0:
            return 100.0
        mfi = 100 - (100 / (1 + pos_sum / neg_sum))
        return round(float(mfi), 2)
    except Exception:
        return None


def calc_volume_weighted_rsi(close, volume, period=14) -> float | None:
    """
    VRSI：成交量加權的 RSI
    """
    try:
        df = pd.concat([close, volume], axis=1).dropna()
        df.columns = ['c', 'v']
        if len(df) < period + 1:
            return None
        delta = df['c'].diff()
        gain = delta.clip(lower=0) * df['v']
        loss = (-delta.clip(upper=0)) * df['v']
        avg_gain = gain.iloc[-period:].mean()
        avg_loss = loss.iloc[-period:].mean()
        if avg_loss == 0:
            return 100.0
        vrsi = 100 - (100 / (1 + avg_gain / avg_loss))
        return round(float(vrsi), 2)
    except Exception:
        return None


def calc_ad_slope(high, low, close, volume, lookback_weeks=8) -> float | None:
    """
    A/D Line 斜率，除以均量標準化
    """
    try:
        df = pd.concat([high, low, close, volume], axis=1).dropna()
        df.columns = ['h', 'l', 'c', 'v']
        days = lookback_weeks * 5
        if len(df) < days:
            return None
        hl = (df['h'] - df['l']).replace(0, np.nan)
        clv = ((df['c'] - df['l']) - (df['h'] - df['c'])) / hl
        ad = (clv * df['v']).cumsum()
        recent = ad.iloc[-days:].values
        x = np.arange(len(recent))
        slope = np.polyfit(x, recent, 1)[0]
        avg_vol = df['v'].iloc[-days:].mean()
        if avg_vol > 0:
            slope = slope / avg_vol
        return round(float(slope), 6)
    except Exception:
        return None


def calc_pvt_slope(close, volume, lookback_weeks=8) -> float | None:
    """
    PVT = cumsum(volume × pct_change(close))，取斜率並除以均量標準化
    """
    try:
        df = pd.concat([close, volume], axis=1).dropna()
        df.columns = ['c', 'v']
        days = lookback_weeks * 5
        if len(df) < days:
            return None
        pvt = (df['v'] * df['c'].pct_change().fillna(0)).cumsum()
        recent = pvt.iloc[-days:].values
        x = np.arange(len(recent))
        slope = np.polyfit(x, recent, 1)[0]
        avg_vol = df['v'].iloc[-days:].mean()
        if avg_vol > 0:
            slope = slope / avg_vol
        return round(float(slope), 6)
    except Exception:
        return None


def calc_vol_surge_score(weekly_rvols: list[float], threshold: float = 1.2) -> float:
    """
    三個子指標等權平均，結果 0-100
    1. 連續高量週數 / 8 × 100
    2. 近 4 週 RVol 峰值，(peak-1)/1.5 × 100
    3. 近 8 週中 rvol > threshold 的比例 × 100
    """
    if not weekly_rvols or len(weekly_rvols) < 4:
        return 50.0
    arr = [v for v in weekly_rvols if v is not None]
    if not arr:
        return 50.0
    consec = 0
    for v in reversed(arr):
        if v > threshold:
            consec += 1
        else:
            break
    s1 = min(consec / 8 * 100, 100)
    peak = max(arr[-4:]) if len(arr) >= 4 else max(arr)
    s2 = max(min((peak - 1) / 1.5 * 100, 100), 0)
    recent8 = arr[-8:] if len(arr) >= 8 else arr
    s3 = sum(1 for v in recent8 if v > threshold) / len(recent8) * 100
    return round((s1 + s2 + s3) / 3, 2)


if __name__ == "__main__":
    import yfinance as yf
    data = yf.download("NVDA", period="1y",
                       auto_adjust=True, progress=False)
    close = data["Close"].squeeze()
    volume = data["Volume"].squeeze()

    print(f"OBV Trend:      {calc_obv_trend(close, volume)}")
    print(f"RVol:           {calc_rvol(volume)}")
    print(f"Vol Momentum:   {calc_vol_momentum(volume)}")
    print(f"PV Divergence:  {calc_pv_divergence(close, volume)}")
