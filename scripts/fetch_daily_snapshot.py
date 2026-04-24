"""Fetch today's and yesterday's top/bottom sub-industry data for daily report."""
import os, sys, json
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

universe = {r["gics_code"]: r for r in (sb.table("gics_universe").select("gics_code,sub_industry,sector").execute().data or [])}

dates_res = sb.table("daily_sub_returns").select("date").order("date", desc=True).limit(1).execute()
if not dates_res.data:
    print("{}", file=sys.stderr)
    sys.exit(1)
latest = dates_res.data[0]["date"]

prev_res = sb.table("daily_sub_returns").select("date").lt("date", latest).order("date", desc=True).limit(1).execute()
prev = prev_res.data[0]["date"] if prev_res.data else None

dates_5d_res = sb.table("daily_sub_returns").select("date").lte("date", latest).order("date", desc=True).limit(5 * 156).execute()
dates_5d = sorted(set(r["date"] for r in (dates_5d_res.data or [])), reverse=True)[:5]

def fetch_all(dt):
    rows = []
    offset = 0
    CHUNK = 1000
    while True:
        res = sb.table("daily_sub_returns").select("*").eq("date", dt).order("rank_today").range(offset, offset + CHUNK - 1).execute()
        rows.extend(res.data or [])
        if not res.data or len(res.data) < CHUNK:
            break
        offset += CHUNK
    for r in rows:
        u = universe.get(r.get("gics_code"), {})
        r["name"] = u.get("sub_industry", "")
        r["sector"] = u.get("sector", "")
    return rows

today_rows = fetch_all(latest)
today_sorted = sorted(today_rows, key=lambda r: r.get("rank_today", 999))
top20 = today_sorted[:20]
bottom10 = today_sorted[-10:]

prev_top20 = []
if prev:
    prev_rows = fetch_all(prev)
    prev_sorted = sorted(prev_rows, key=lambda r: r.get("rank_today", 999))
    prev_top20 = prev_sorted[:20]

out = {
    "latest_date": latest,
    "prev_date": prev,
    "dates_5d": dates_5d,
    "top20": top20,
    "bottom10": bottom10,
    "prev_top20": prev_top20,
}
json.dump(out, sys.stdout, default=str, ensure_ascii=False, indent=2)
