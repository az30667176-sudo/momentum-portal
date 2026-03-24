"""
universe.py
從 Wikipedia 抓取 S&P 1500 成分股清單（SP500 + SP400 + SP600）
並整理成統一格式供後續 pipeline 使用
"""

import pandas as pd
import time
import logging
import requests
from io import StringIO

logger = logging.getLogger(__name__)

SP_URLS = {
    "SP500": "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies",
    "SP400": "https://en.wikipedia.org/wiki/List_of_S%26P_400_companies",
    "SP600": "https://en.wikipedia.org/wiki/List_of_S%26P_600_companies",
}

# Wikipedia 可能用的欄位名稱對應（各頁格式略有不同）
COLUMN_ALIASES = {
    "ticker":       ["Symbol", "Ticker", "Ticker symbol", "symbol"],
    "company":      ["Security", "Company", "Name", "security"],
    "sector":       ["GICS Sector", "Sector", "gics_sector"],
    "sub_industry": ["GICS Sub-Industry", "Sub-Industry",
                     "GICS Sub Industry", "gics_sub-industry"],
}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """把不同 Wikipedia 頁面的欄位名稱統一化"""
    rename_map = {}
    for target, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            # 不區分大小寫比對
            match = next(
                (c for c in df.columns if c.strip().lower() == alias.lower()),
                None
            )
            if match and target not in rename_map.values():
                rename_map[match] = target
                break
    return df.rename(columns=rename_map)


WIKI_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def _fetch_single_index(url: str, index_name: str,
                        max_retries: int = 3) -> pd.DataFrame:
    """抓取單一指數的成分股清單，含 retry 邏輯"""
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Fetching {index_name} (attempt {attempt})...")
            resp = requests.get(url, headers=WIKI_HEADERS, timeout=30)
            resp.raise_for_status()
            tables = pd.read_html(StringIO(resp.text), flavor="html5lib")
            if not tables:
                raise ValueError(f"No tables found at {url}")

            df = tables[0].copy()
            df = _normalize_columns(df)

            required = ["ticker", "company", "sector", "sub_industry"]
            missing = [c for c in required if c not in df.columns]
            if missing:
                # 嘗試第二張表（某些 Wikipedia 頁面結構不同）
                if len(tables) > 1:
                    df = tables[1].copy()
                    df = _normalize_columns(df)
                    missing = [c for c in required if c not in df.columns]
                if missing:
                    raise ValueError(
                        f"Missing columns {missing}. "
                        f"Available: {list(tables[0].columns)}"
                    )

            df["index_member"] = index_name
            df["ticker"] = df["ticker"].str.strip().str.replace(".", "-", regex=False)
            df = df[["ticker", "company", "sector", "sub_industry", "index_member"]]
            df = df.dropna(subset=["ticker", "sector", "sub_industry"])

            logger.info(f"  → {index_name}: {len(df)} stocks")
            return df

        except Exception as e:
            logger.warning(f"  Attempt {attempt} failed: {e}")
            if attempt < max_retries:
                time.sleep(5 * attempt)
            else:
                logger.error(f"  All {max_retries} attempts failed for {index_name}")
                return pd.DataFrame()


def fetch_sp1500_universe() -> pd.DataFrame:
    """
    從 Wikipedia 抓取 S&P 1500 全部成分股。

    Returns
    -------
    pd.DataFrame
        欄位：ticker, company, sector, sub_industry, index_member
        約 1,500 行，按 ticker 去重複
    """
    frames = []
    for index_name, url in SP_URLS.items():
        df = _fetch_single_index(url, index_name)
        if not df.empty:
            frames.append(df)
        time.sleep(2)  # 禮貌爬取，避免被 Wikipedia 封鎖

    if not frames:
        raise RuntimeError("Failed to fetch any index data from Wikipedia")

    universe = pd.concat(frames, ignore_index=True)

    # SP500 優先（若同一 ticker 同時在 SP500 和 SP400，保留 SP500）
    priority = {"SP500": 0, "SP400": 1, "SP600": 2}
    universe["_priority"] = universe["index_member"].map(priority)
    universe = (universe
                .sort_values("_priority")
                .drop_duplicates(subset=["ticker"])
                .drop(columns=["_priority"])
                .reset_index(drop=True))

    logger.info(f"Total universe: {len(universe)} unique stocks, "
                f"{universe['sub_industry'].nunique()} sub-industries")
    return universe


def get_sub_industry_mapping(universe: pd.DataFrame) -> dict:
    """
    從 universe DataFrame 建立 sub-industry → ticker list 的對應表。

    Returns
    -------
    dict
        {sub_industry_name: [ticker1, ticker2, ...]}
    """
    mapping = {}
    for sub, group in universe.groupby("sub_industry"):
        mapping[sub] = group["ticker"].tolist()
    return mapping


def get_gics_universe_records(universe: pd.DataFrame) -> list[dict]:
    """
    從 universe 提取唯一的 GICS sub-industry 清單，
    用於 upsert 進 Supabase gics_universe table。

    Returns
    -------
    list[dict]
        每個 sub-industry 的 {sector, sub_industry} dict
    """
    gics = (universe[["sector", "sub_industry"]]
            .drop_duplicates(subset=["sub_industry"])
            .reset_index(drop=True))

    # 用 sub_industry 名稱的 hash 生成 8 碼 GICS-like code（因為我們沒有官方 code）
    records = []
    for _, row in gics.iterrows():
        # 生成簡單的 code：sector 首字母 + sub_industry 前7碼 hash
        import hashlib
        code_raw = f"{row['sector']}_{row['sub_industry']}"
        gics_code = hashlib.md5(code_raw.encode()).hexdigest()[:8].upper()
        records.append({
            "gics_code":    gics_code,
            "sector":       row["sector"],
            "sub_industry": row["sub_industry"],
        })
    return records


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    df = fetch_sp1500_universe()
    print(df.head(10).to_string())
    print(f"\nSectors: {df['sector'].nunique()}")
    print(f"Sub-industries: {df['sub_industry'].nunique()}")
