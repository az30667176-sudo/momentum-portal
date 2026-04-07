"""One-off: pull last ~2 weeks of daily_sub_returns and summarise rotation."""
import os, sys, json
from pathlib import Path
from datetime import date, timedelta
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

# pull last 15 calendar days of sub returns
end = date.today()
start = end - timedelta(days=20)

rows = []
offset = 0
CHUNK = 1000
while True:
    res = (
        sb.table("daily_sub_returns")
        .select("date,gics_code,ret_1d,ret_1w,ret_1m,ret_3m,mom_score,rank_today,delta_rank,breadth_20ma,breadth_50ma,rvol,obv_trend")
        .gte("date", start.isoformat())
        .lte("date", end.isoformat())
        .order("date", desc=True)
        .range(offset, offset + CHUNK - 1)
        .execute()
    )
    rows.extend(res.data or [])
    if not res.data or len(res.data) < CHUNK:
        break
    offset += CHUNK

print(f"fetched {len(rows)} sub rows", file=sys.stderr)

# also pull gics_universe for sector mapping
uni = sb.table("gics_universe").select("gics_code,sector,sub_industry").execute().data
print(f"fetched {len(uni)} universe rows", file=sys.stderr)

out = {"rows": rows, "universe": uni}
print(json.dumps(out))
