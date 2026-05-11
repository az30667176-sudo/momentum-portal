"""
scan_notable_stocks.py
Scan for market-notable stocks: top gainers/losers + industry outliers.
Output JSON to stdout for use in daily/weekly report SOP.

Usage:
  python scripts/scan_notable_stocks.py                    # daily (ret_1d)
  python scripts/scan_notable_stocks.py --weekly           # weekly (ret_1w)
  python scripts/scan_notable_stocks.py --top 15           # top 15 (default 10)
  python scripts/scan_notable_stocks.py --index SP500      # SP500 only
  python scripts/scan_notable_stocks.py --date 2026-05-09  # specific date
"""

import argparse
import json
import math
import os
import sys
from datetime import datetime
from pathlib import Path
from statistics import mean, median, stdev

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

CHUNK = 1000
Z_OUTLIER = 2.0
Z_DISAGREE = 1.5
MIN_GROUP = 5


# ── Data Fetching ────────────────────────────────────────────────

def get_latest_date():
    res = sb.table("daily_stock_returns").select("date").order("date", desc=True).limit(1).execute()
    if not res.data:
        print("No data in daily_stock_returns", file=sys.stderr)
        sys.exit(1)
    return res.data[0]["date"]


def fetch_all_stock_returns(date, index_filter=None):
    rows = []
    offset = 0
    while True:
        q = sb.table("daily_stock_returns").select("*").eq("date", date)
        q = q.order("ticker").range(offset, offset + CHUNK - 1)
        res = q.execute()
        rows.extend(res.data or [])
        if not res.data or len(res.data) < CHUNK:
            break
        offset += CHUNK

    if index_filter:
        ticker_index = fetch_index_map()
        rows = [r for r in rows if ticker_index.get(r["ticker"]) == index_filter]

    return rows


def fetch_universe_map():
    """Return {ticker: {company, sector, sub_industry, index_member, gics_code}}"""
    rows = []
    offset = 0
    while True:
        res = (sb.table("stock_universe")
               .select("ticker, company, gics_code, index_member")
               .eq("is_active", True)
               .order("ticker")
               .range(offset, offset + CHUNK - 1)
               .execute())
        rows.extend(res.data or [])
        if not res.data or len(res.data) < CHUNK:
            break
        offset += CHUNK

    gics = {}
    for r in (sb.table("gics_universe").select("gics_code, sector, sub_industry").execute().data or []):
        gics[r["gics_code"]] = r

    universe = {}
    for r in rows:
        g = gics.get(r["gics_code"], {})
        universe[r["ticker"]] = {
            "company": r["company"],
            "sector": g.get("sector", ""),
            "sub_industry": g.get("sub_industry", ""),
            "index_member": r["index_member"],
            "gics_code": r["gics_code"],
        }
    return universe


def fetch_index_map():
    """Return {ticker: index_member}"""
    rows = []
    offset = 0
    while True:
        res = (sb.table("stock_universe")
               .select("ticker, index_member")
               .eq("is_active", True)
               .order("ticker")
               .range(offset, offset + CHUNK - 1)
               .execute())
        rows.extend(res.data or [])
        if not res.data or len(res.data) < CHUNK:
            break
        offset += CHUNK
    return {r["ticker"]: r["index_member"] for r in rows}


# ── Analysis ─────────────────────────────────────────────────────

def safe_val(v):
    if v is None:
        return None
    try:
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (ValueError, TypeError):
        return None


def compute_group_stats(stocks, universe, group_by, return_field):
    """Group stocks by sub_industry or sector, compute mean/std/count per group."""
    groups = {}
    for s in stocks:
        u = universe.get(s["ticker"], {})
        key = u.get(group_by, "")
        if not key:
            continue
        val = safe_val(s.get(return_field))
        if val is None:
            continue
        groups.setdefault(key, []).append(val)

    stats = {}
    for key, vals in groups.items():
        n = len(vals)
        m = mean(vals)
        sd = stdev(vals) if n >= 2 else 0.0
        stats[key] = {"mean": m, "std": sd, "count": n}
    return stats


def find_top_movers(stocks, universe, return_field, top_n):
    """Return (gainers, losers) sorted by return_field."""
    valid = []
    for s in stocks:
        val = safe_val(s.get(return_field))
        if val is not None:
            valid.append((s, val))

    valid.sort(key=lambda x: x[1], reverse=True)
    gainers = [s for s, _ in valid[:top_n]]
    losers = [s for s, _ in valid[-top_n:]]
    losers.reverse()
    return gainers, losers


def compute_notability_score(return_pct, z_score, rvol, direction_disagree, all_returns):
    """Composite 0-100 notability score."""
    z_comp = min(abs(z_score) / 3.0, 1.0)

    abs_ret = abs(return_pct)
    all_abs = sorted(abs(r) for r in all_returns if r is not None)
    if all_abs:
        rank = sum(1 for x in all_abs if x <= abs_ret)
        pctile = rank / len(all_abs)
    else:
        pctile = 0.5

    dir_penalty = 1.0 if direction_disagree else 0.0

    rvol_val = safe_val(rvol)
    rvol_comp = min(rvol_val / 3.0, 1.0) if rvol_val and rvol_val > 0 else 0.0

    score = 0.30 * z_comp + 0.25 * pctile + 0.25 * dir_penalty + 0.20 * rvol_comp
    return round(score * 100, 1)


def detect_outliers(stocks, universe, sub_stats, sector_stats, return_field,
                    top_gainers_set, top_losers_set, all_returns):
    """Flag stocks as outliers based on z-score within sub-industry/sector."""
    results = []
    for s in stocks:
        u = universe.get(s["ticker"], {})
        sub = u.get("sub_industry", "")
        sector = u.get("sector", "")
        val = safe_val(s.get(return_field))
        if val is None:
            continue

        ss = sub_stats.get(sub)
        se = sector_stats.get(sector)

        if ss and ss["count"] >= MIN_GROUP and ss["std"] > 1e-8:
            z = (val - ss["mean"]) / ss["std"]
            z_level = "sub_industry"
            group_mean = ss["mean"]
            group_size = ss["count"]
        elif se and se["std"] > 1e-8:
            z = (val - se["mean"]) / se["std"]
            z_level = "sector"
            group_mean = se["mean"]
            group_size = se["count"]
        else:
            continue

        dir_disagree = False
        if abs(group_mean) > 0.1:
            dir_disagree = (val > 0 and group_mean < 0) or (val < 0 and group_mean > 0)

        abnormal_types = []
        ticker = s["ticker"]
        if ticker in top_gainers_set:
            abnormal_types.append("Top Gainer")
        if ticker in top_losers_set:
            abnormal_types.append("Top Loser")

        if not dir_disagree:
            if z >= Z_OUTLIER:
                abnormal_types.append("Strong Outperformer")
            elif z <= -Z_OUTLIER:
                abnormal_types.append("Strong Underperformer")
        else:
            if abs(z) >= Z_DISAGREE:
                if val > 0:
                    abnormal_types.append("Industry Outlier – Positive")
                else:
                    abnormal_types.append("Industry Outlier – Negative")

        if not abnormal_types:
            continue

        industry_avg = ss["mean"] if ss else (se["mean"] if se else 0)
        notability = compute_notability_score(val, z, s.get("rvol"), dir_disagree, all_returns)

        now = datetime.now()
        month_name = now.strftime("%B")
        year = now.year
        company = u.get("company", "")

        results.append({
            "ticker": ticker,
            "company": company,
            "sector": sector,
            "sub_industry": sub,
            "index_member": u.get("index_member"),
            "gics_code": u.get("gics_code", ""),
            "return_pct": round(val, 2),
            "industry_avg_pct": round(industry_avg, 2),
            "diff_vs_industry": round(val - industry_avg, 2),
            "z_score": round(z, 2),
            "z_level": z_level,
            "group_size": group_size,
            "mom_score": safe_val(s.get("mom_score")),
            "rvol": safe_val(s.get("rvol")),
            "notability_score": notability,
            "abnormal_types": abnormal_types,
            "direction_disagree": dir_disagree,
            "news_search_query": f"{ticker} {company} stock news {month_name} {year}",
        })

    results.sort(key=lambda x: x["notability_score"], reverse=True)
    return results


# ── Output ───────────────────────────────────────────────────────

def build_stock_entry(s, universe, sub_stats, sector_stats, return_field, all_returns):
    """Build a single stock entry dict for top gainers/losers."""
    u = universe.get(s["ticker"], {})
    sub = u.get("sub_industry", "")
    sector = u.get("sector", "")
    val = safe_val(s.get(return_field)) or 0

    ss = sub_stats.get(sub)
    se = sector_stats.get(sector)

    if ss and ss["count"] >= MIN_GROUP and ss["std"] > 1e-8:
        z = (val - ss["mean"]) / ss["std"]
        z_level = "sub_industry"
    elif se and se["std"] > 1e-8:
        z = (val - se["mean"]) / se["std"]
        z_level = "sector"
    else:
        z = 0
        z_level = "N/A"

    industry_avg = (ss["mean"] if ss else (se["mean"] if se else 0))
    group_mean = industry_avg
    dir_disagree = False
    if abs(group_mean) > 0.1:
        dir_disagree = (val > 0 and group_mean < 0) or (val < 0 and group_mean > 0)

    notability = compute_notability_score(val, z, s.get("rvol"), dir_disagree, all_returns)

    now = datetime.now()
    month_name = now.strftime("%B")
    year = now.year
    company = u.get("company", "")

    return {
        "ticker": s["ticker"],
        "company": company,
        "sector": sector,
        "sub_industry": sub,
        "index_member": u.get("index_member"),
        "gics_code": u.get("gics_code", ""),
        "return_pct": round(val, 2),
        "industry_avg_pct": round(industry_avg, 2),
        "diff_vs_industry": round(val - industry_avg, 2),
        "z_score": round(z, 2),
        "z_level": z_level,
        "mom_score": safe_val(s.get("mom_score")),
        "rvol": safe_val(s.get("rvol")),
        "notability_score": notability,
        "abnormal_types": [],
        "news_search_query": f"{s['ticker']} {company} stock news {month_name} {year}",
    }


def main():
    parser = argparse.ArgumentParser(description="Scan for notable/abnormal stocks")
    parser.add_argument("--weekly", action="store_true", help="Use ret_1w instead of ret_1d")
    parser.add_argument("--top", type=int, default=10, help="Number of top gainers/losers")
    parser.add_argument("--index", type=str, default=None, help="Filter by index: SP500/SP400/SP600")
    parser.add_argument("--date", type=str, default=None, help="Specific date (YYYY-MM-DD)")
    args = parser.parse_args()

    mode = "weekly" if args.weekly else "daily"
    return_field = "ret_1w" if args.weekly else "ret_1d"
    top_n = args.top

    print(f"Mode: {mode}, return_field: {return_field}, top_n: {top_n}", file=sys.stderr)

    date = args.date or get_latest_date()
    print(f"Date: {date}", file=sys.stderr)

    print("Fetching stock returns...", file=sys.stderr)
    stocks = fetch_all_stock_returns(date, args.index)
    print(f"  Got {len(stocks)} stocks", file=sys.stderr)

    print("Fetching universe map...", file=sys.stderr)
    universe = fetch_universe_map()
    print(f"  Got {len(universe)} tickers", file=sys.stderr)

    all_returns = [safe_val(s.get(return_field)) for s in stocks]
    all_returns = [r for r in all_returns if r is not None]

    print("Computing group stats...", file=sys.stderr)
    sub_stats = compute_group_stats(stocks, universe, "sub_industry", return_field)
    sector_stats = compute_group_stats(stocks, universe, "sector", return_field)

    print("Finding top movers...", file=sys.stderr)
    gainers_raw, losers_raw = find_top_movers(stocks, universe, return_field, top_n)
    top_gainers_set = {s["ticker"] for s in gainers_raw}
    top_losers_set = {s["ticker"] for s in losers_raw}

    gainers = [build_stock_entry(s, universe, sub_stats, sector_stats, return_field, all_returns) for s in gainers_raw]
    losers = [build_stock_entry(s, universe, sub_stats, sector_stats, return_field, all_returns) for s in losers_raw]

    for g in gainers:
        g["abnormal_types"].append("Top Gainer")
    for l in losers:
        l["abnormal_types"].append("Top Loser")

    print("Detecting outliers...", file=sys.stderr)
    outliers = detect_outliers(
        stocks, universe, sub_stats, sector_stats, return_field,
        top_gainers_set, top_losers_set, all_returns,
    )

    outlier_tickers = top_gainers_set | top_losers_set
    industry_only = [o for o in outliers if o["ticker"] not in outlier_tickers]
    overlap_count = len([o for o in outliers if o["ticker"] in outlier_tickers])

    for g in gainers:
        matching = [o for o in outliers if o["ticker"] == g["ticker"]]
        if matching:
            for t in matching[0]["abnormal_types"]:
                if t not in g["abnormal_types"]:
                    g["abnormal_types"].append(t)
            g["z_score"] = matching[0]["z_score"]
            g["z_level"] = matching[0]["z_level"]

    for l in losers:
        matching = [o for o in outliers if o["ticker"] == l["ticker"]]
        if matching:
            for t in matching[0]["abnormal_types"]:
                if t not in l["abnormal_types"]:
                    l["abnormal_types"].append(t)
            l["z_score"] = matching[0]["z_score"]
            l["z_level"] = matching[0]["z_level"]

    sector_outlier_counts = {}
    for o in outliers:
        sec = o["sector"]
        sector_outlier_counts[sec] = sector_outlier_counts.get(sec, 0) + 1
    top_sectors = sorted(sector_outlier_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    positive_pct = (sum(1 for r in all_returns if r > 0) / len(all_returns) * 100) if all_returns else 0

    output = {
        "meta": {
            "date": date,
            "mode": mode,
            "return_field": return_field,
            "total_stocks": len(stocks),
            "index_filter": args.index,
            "thresholds": {
                "z_outlier": Z_OUTLIER,
                "z_disagree": Z_DISAGREE,
                "min_group": MIN_GROUP,
                "top_n": top_n,
            },
            "market_summary": {
                "median_return": round(median(all_returns), 2) if all_returns else 0,
                "mean_return": round(mean(all_returns), 2) if all_returns else 0,
                "positive_pct": round(positive_pct, 1),
            },
        },
        "top_gainers": gainers,
        "top_losers": losers,
        "industry_outliers": industry_only,
        "summary": {
            "total_flagged": len(outliers),
            "overlap_count": overlap_count,
            "sectors_with_most_outliers": [
                {"sector": s, "count": c} for s, c in top_sectors
            ],
        },
    }

    json.dump(output, sys.stdout, default=str, ensure_ascii=False, indent=2)
    print(f"\nDone: {len(gainers)} gainers, {len(losers)} losers, {len(industry_only)} industry outliers", file=sys.stderr)


if __name__ == "__main__":
    main()
