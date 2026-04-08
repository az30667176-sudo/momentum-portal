"""One-off: pull quant snapshot for a single ticker + its sub-industry peers.

Usage: python scripts/fetch_stock_memo.py CVX
"""
import os, sys, json
from pathlib import Path
from datetime import date, timedelta
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

ticker = sys.argv[1].upper() if len(sys.argv) > 1 else "CVX"

# 1. who is this ticker — get gics_code + company
who = (
    sb.table("stock_universe")
    .select("ticker,company,gics_code,index_member,is_active")
    .eq("ticker", ticker)
    .execute()
    .data
)
if not who:
    print(f"ticker {ticker} not in stock_universe", file=sys.stderr)
    sys.exit(1)
me = who[0]
gics = me["gics_code"]

# 2. sector / sub-industry name
uni = (
    sb.table("gics_universe")
    .select("gics_code,sector,sub_industry")
    .eq("gics_code", gics)
    .execute()
    .data[0]
)

# 3. latest stock-level row for this ticker
latest_stock = (
    sb.table("daily_stock_returns")
    .select("*")
    .eq("ticker", ticker)
    .order("date", desc=True)
    .limit(1)
    .execute()
    .data
)
if not latest_stock:
    print(f"no daily_stock_returns for {ticker}", file=sys.stderr)
    sys.exit(1)
stock = latest_stock[0]
asof = stock["date"]

# 4. all peers in same sub-industry on same date
peers = (
    sb.table("daily_stock_returns")
    .select("ticker,ret_1w,ret_1m,ret_3m,ret_6m,ret_12m,mom_score,rank_in_sub,rvol")
    .eq("gics_code", gics)
    .eq("date", asof)
    .order("rank_in_sub", desc=False)
    .execute()
    .data
)

# 5. sub-industry level rotation context (latest row)
sub_latest = (
    sb.table("daily_sub_returns")
    .select("*")
    .eq("gics_code", gics)
    .order("date", desc=True)
    .limit(1)
    .execute()
    .data[0]
)

# 6. sub history last 30 days for momentum trend
sub_hist = (
    sb.table("daily_sub_returns")
    .select("date,mom_score,rank_today,ret_1w")
    .eq("gics_code", gics)
    .order("date", desc=True)
    .limit(30)
    .execute()
    .data
)

# 7. peer companies — also need company names
peer_tickers = [p["ticker"] for p in peers]
peer_names = (
    sb.table("stock_universe")
    .select("ticker,company")
    .in_("ticker", peer_tickers)
    .execute()
    .data
)
name_map = {r["ticker"]: r["company"] for r in peer_names}
for p in peers:
    p["company"] = name_map.get(p["ticker"], "")

out = {
    "ticker": ticker,
    "company": me["company"],
    "gics_code": gics,
    "sector": uni["sector"],
    "sub_industry": uni["sub_industry"],
    "asof": asof,
    "stock": stock,
    "sub_latest": sub_latest,
    "sub_hist": sub_hist,
    "peers": peers,
}
print(json.dumps(out, default=str, indent=2))
