"""Crunch the JSON dump from fetch_weekly_rotation.py into a rotation summary."""
import json, sys
from collections import defaultdict
from statistics import mean, median

with open("scripts/rot.json", encoding="utf-8") as f:
    blob = json.load(f)

rows = blob["rows"]
uni = {u["gics_code"]: u for u in blob["universe"]}

# group by date
by_date = defaultdict(list)
for r in rows:
    by_date[r["date"]].append(r)
dates = sorted(by_date.keys(), reverse=True)
print("dates available:", dates[:6])
latest = dates[0]
prev_week_date = None
# find a date ~5 trading days back
if len(dates) >= 6:
    prev_week_date = dates[5]
print(f"latest={latest}  prev_week≈{prev_week_date}")

latest_rows = by_date[latest]
print(f"\nlatest snapshot has {len(latest_rows)} subs")

# attach sector/sub names
def name(r):
    u = uni.get(r["gics_code"], {})
    return u.get("sub_industry", r["gics_code"]), u.get("sector", "?")

# ── Sector aggregation (1W return, equal-weighted across subs in sector) ──
sector_1w = defaultdict(list)
sector_1m = defaultdict(list)
sector_3m = defaultdict(list)
for r in latest_rows:
    sub, sec = name(r)
    if r.get("ret_1w") is not None: sector_1w[sec].append(r["ret_1w"])
    if r.get("ret_1m") is not None: sector_1m[sec].append(r["ret_1m"])
    if r.get("ret_3m") is not None: sector_3m[sec].append(r["ret_3m"])

print("\n=== SECTOR 1W (equal-weight of sub-industries within sector) ===")
sec_rank = sorted(((s, mean(v)) for s,v in sector_1w.items()), key=lambda x: -x[1])
for s,v in sec_rank:
    m1 = mean(sector_1m[s]) if sector_1m[s] else 0
    m3 = mean(sector_3m[s]) if sector_3m[s] else 0
    print(f"  {s:30s}  1W {v:+6.2f}%   1M {m1:+6.2f}%   3M {m3:+6.2f}%")

# ── Top / bottom sub-industries by 1W ──
print("\n=== TOP 15 SUB-INDUSTRIES (1W return) ===")
ranked = sorted(latest_rows, key=lambda r: -(r.get("ret_1w") or -999))
for r in ranked[:15]:
    sub, sec = name(r)
    print(f"  {sub[:38]:38s} ({sec[:12]:12s})  1W {r['ret_1w']:+6.2f}%  mom {r.get('mom_score') or 0:5.1f}  rank {r.get('rank_today')}  Δ {r.get('delta_rank') or 0:+d}")

print("\n=== BOTTOM 15 SUB-INDUSTRIES (1W return) ===")
for r in ranked[-15:]:
    sub, sec = name(r)
    print(f"  {sub[:38]:38s} ({sec[:12]:12s})  1W {r['ret_1w']:+6.2f}%  mom {r.get('mom_score') or 0:5.1f}  rank {r.get('rank_today')}  Δ {r.get('delta_rank') or 0:+d}")

# ── Biggest rank improvements / drops vs last week (delta_rank) ──
print("\n=== BIGGEST RANK IMPROVEMENTS (Δrank, positive = climbed) ===")
with_delta = [r for r in latest_rows if r.get("delta_rank") is not None]
up = sorted(with_delta, key=lambda r: -r["delta_rank"])
for r in up[:10]:
    sub, sec = name(r)
    print(f"  {sub[:38]:38s} ({sec[:12]:12s})  Δ {r['delta_rank']:+4d}  → rank {r['rank_today']}  1W {r.get('ret_1w') or 0:+5.2f}%")

print("\n=== BIGGEST RANK DROPS ===")
for r in up[-10:]:
    sub, sec = name(r)
    print(f"  {sub[:38]:38s} ({sec[:12]:12s})  Δ {r['delta_rank']:+4d}  → rank {r['rank_today']}  1W {r.get('ret_1w') or 0:+5.2f}%")

# ── Breadth ──
print("\n=== BREADTH ===")
b20 = [r["breadth_20ma"] for r in latest_rows if r.get("breadth_20ma") is not None]
b50 = [r["breadth_50ma"] for r in latest_rows if r.get("breadth_50ma") is not None]
if b20: print(f"  median % stocks > 20MA across subs: {median(b20)*100:.1f}%")
if b50: print(f"  median % stocks > 50MA across subs: {median(b50)*100:.1f}%")

# breadth by sector
print("\n=== BREADTH BY SECTOR (median % > 50MA) ===")
sec_breadth = defaultdict(list)
for r in latest_rows:
    sub, sec = name(r)
    if r.get("breadth_50ma") is not None:
        sec_breadth[sec].append(r["breadth_50ma"])
for s, v in sorted(sec_breadth.items(), key=lambda kv: -median(kv[1])):
    print(f"  {s:30s}  {median(v)*100:5.1f}%")

# ── Momentum score top 20 ──
print("\n=== TOP 20 BY MOM_SCORE (latest) ===")
mom = sorted([r for r in latest_rows if r.get("mom_score") is not None], key=lambda r: -r["mom_score"])
for r in mom[:20]:
    sub, sec = name(r)
    print(f"  {sub[:38]:38s} ({sec[:12]:12s})  mom {r['mom_score']:5.1f}  1M {r.get('ret_1m') or 0:+6.2f}%  3M {r.get('ret_3m') or 0:+6.2f}%")
