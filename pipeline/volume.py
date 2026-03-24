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
