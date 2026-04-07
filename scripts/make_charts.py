"""Generate weekly rotation charts from scripts/rot.json."""
import json, os
from collections import defaultdict
from statistics import mean, median
import matplotlib.pyplot as plt
import matplotlib as mpl

mpl.rcParams["font.family"] = "DejaVu Sans"
mpl.rcParams["axes.spines.top"] = False
mpl.rcParams["axes.spines.right"] = False
mpl.rcParams["axes.titleweight"] = "bold"
mpl.rcParams["figure.dpi"] = 130

OUT = "scripts/charts"
os.makedirs(OUT, exist_ok=True)

with open("scripts/rot.json", encoding="utf-8") as f:
    blob = json.load(f)
rows = blob["rows"]
uni = {u["gics_code"]: u for u in blob["universe"]}

by_date = defaultdict(list)
for r in rows:
    by_date[r["date"]].append(r)
dates = sorted(by_date.keys(), reverse=True)
latest = dates[0]
latest_rows = by_date[latest]

def name(r):
    u = uni.get(r["gics_code"], {})
    return u.get("sub_industry", r["gics_code"]), u.get("sector", "?")

# ── Chart 1: Sector 1W returns ──
sec_1w, sec_1m, sec_3m = defaultdict(list), defaultdict(list), defaultdict(list)
for r in latest_rows:
    _, sec = name(r)
    if r.get("ret_1w") is not None: sec_1w[sec].append(r["ret_1w"])
    if r.get("ret_1m") is not None: sec_1m[sec].append(r["ret_1m"])
    if r.get("ret_3m") is not None: sec_3m[sec].append(r["ret_3m"])

sectors = sorted(sec_1w.keys(), key=lambda s: mean(sec_1w[s]))
vals_1w = [mean(sec_1w[s]) for s in sectors]
vals_3m = [mean(sec_3m[s]) for s in sectors]
colors = ["#16a34a" if v >= 0 else "#dc2626" for v in vals_1w]

fig, ax = plt.subplots(figsize=(8.5, 5))
y = range(len(sectors))
ax.barh(y, vals_1w, color=colors, alpha=0.85)
ax.set_yticks(list(y))
ax.set_yticklabels(sectors, fontsize=9)
ax.axvline(0, color="#444", lw=0.6)
for i, v in enumerate(vals_1w):
    ax.text(v + (0.15 if v >= 0 else -0.15), i, f"{v:+.1f}%",
            va="center", ha="left" if v >= 0 else "right", fontsize=8)
ax.set_xlabel("1W return (equal-weight of sub-industries within sector, %)")
ax.set_title("Exhibit 1 — Sector 1-Week Returns")
ax.set_xlim(min(vals_1w)-2, max(vals_1w)+2)
plt.tight_layout()
plt.savefig(f"{OUT}/01_sector_1w.png", bbox_inches="tight")
plt.close()

# ── Chart 2: 1W vs 3M sector scatter (rotation map) ──
fig, ax = plt.subplots(figsize=(8, 5.5))
for s in sec_1w.keys():
    x = mean(sec_3m[s]) if sec_3m[s] else 0
    y = mean(sec_1w[s])
    ax.scatter(x, y, s=140, alpha=0.7,
               color="#16a34a" if y >= 0 else "#dc2626")
    ax.annotate(s, (x, y), fontsize=8, xytext=(6, 4), textcoords="offset points")
ax.axhline(0, color="#888", lw=0.5, ls="--")
ax.axvline(0, color="#888", lw=0.5, ls="--")
ax.set_xlabel("3-Month return (%)")
ax.set_ylabel("1-Week return (%)")
ax.set_title("Exhibit 2 — Rotation Map: This Week vs 3M Trend")
ax.grid(True, alpha=0.2)
# quadrant labels
ax.text(0.98, 0.98, "Trend leaders\nstill bid", transform=ax.transAxes,
        ha="right", va="top", fontsize=8, color="#16a34a", alpha=0.6)
ax.text(0.02, 0.98, "Laggards\nbouncing", transform=ax.transAxes,
        ha="left", va="top", fontsize=8, color="#16a34a", alpha=0.6)
ax.text(0.98, 0.02, "Trend leaders\nunwinding", transform=ax.transAxes,
        ha="right", va="bottom", fontsize=8, color="#dc2626", alpha=0.6)
plt.tight_layout()
plt.savefig(f"{OUT}/02_rotation_map.png", bbox_inches="tight")
plt.close()

# ── Chart 3: Top / bottom 12 sub-industries by 1W ──
ranked = sorted([r for r in latest_rows if r.get("ret_1w") is not None],
                key=lambda r: r["ret_1w"])
bottom = ranked[:12]
top = ranked[-12:]
all12 = bottom + top
labels = [name(r)[0][:30] for r in all12]
vals = [r["ret_1w"] for r in all12]
cols = ["#dc2626"]*12 + ["#16a34a"]*12

fig, ax = plt.subplots(figsize=(9, 7))
y = range(len(labels))
ax.barh(y, vals, color=cols, alpha=0.85)
ax.set_yticks(list(y))
ax.set_yticklabels(labels, fontsize=8)
ax.axvline(0, color="#444", lw=0.6)
for i, v in enumerate(vals):
    ax.text(v + (0.3 if v >= 0 else -0.3), i, f"{v:+.1f}%",
            va="center", ha="left" if v >= 0 else "right", fontsize=7)
ax.set_xlabel("1W return (%)")
ax.set_title("Exhibit 3 — 12 Best & 12 Worst Sub-Industries (1W)")
plt.tight_layout()
plt.savefig(f"{OUT}/03_top_bottom_subs.png", bbox_inches="tight")
plt.close()

# ── Chart 4: Energy late-stage unwind: top mom_score vs 1W return ──
mom_top = sorted([r for r in latest_rows if r.get("mom_score") is not None],
                 key=lambda r: -r["mom_score"])[:20]
fig, ax = plt.subplots(figsize=(9, 6))
for r in mom_top:
    sub, sec = name(r)
    is_energy = sec == "Energy"
    color = "#ea580c" if is_energy else "#3b82f6"
    ax.scatter(r["mom_score"], r.get("ret_1w") or 0, s=140,
               color=color, alpha=0.75,
               edgecolor="#000", linewidth=0.4)
    ax.annotate(sub[:22], (r["mom_score"], r.get("ret_1w") or 0),
                fontsize=7, xytext=(5, 3), textcoords="offset points")
ax.axhline(0, color="#888", lw=0.5, ls="--")
ax.set_xlabel("Mom Score (0–100, momentum z-score)")
ax.set_ylabel("1W return (%)")
ax.set_title("Exhibit 4 — Top-20 Mom-Score Subs: Energy (orange) Unwinding While\nTech / Industrials (blue) Hold")
ax.grid(True, alpha=0.2)
plt.tight_layout()
plt.savefig(f"{OUT}/04_energy_unwind.png", bbox_inches="tight")
plt.close()

# ── Chart 5: Biggest rank improvers vs drops ──
with_d = [r for r in latest_rows if r.get("delta_rank") is not None]
up10 = sorted(with_d, key=lambda r: -r["delta_rank"])[:10]
dn10 = sorted(with_d, key=lambda r: r["delta_rank"])[:10]
all20 = list(reversed(dn10)) + up10
labels = [name(r)[0][:30] for r in all20]
vals = [r["delta_rank"] for r in all20]
cols = ["#dc2626" if v < 0 else "#16a34a" for v in vals]

fig, ax = plt.subplots(figsize=(9, 7))
y = range(len(labels))
ax.barh(y, vals, color=cols, alpha=0.85)
ax.set_yticks(list(y))
ax.set_yticklabels(labels, fontsize=8)
ax.axvline(0, color="#444", lw=0.6)
for i, v in enumerate(vals):
    ax.text(v + (0.3 if v >= 0 else -0.3), i, f"{v:+d}",
            va="center", ha="left" if v >= 0 else "right", fontsize=7)
ax.set_xlabel("Δ rank vs prior week (positive = climbed)")
ax.set_title("Exhibit 5 — Biggest Rank Climbers (Staples-heavy) vs Drops")
plt.tight_layout()
plt.savefig(f"{OUT}/05_rank_delta.png", bbox_inches="tight")
plt.close()

# ── Chart 6: Materials bifurcation ──
materials = [r for r in latest_rows if name(r)[1] == "Materials"]
materials_sorted = sorted(materials, key=lambda r: -(r.get("ret_1w") or -999))
labels = [name(r)[0][:28] for r in materials_sorted]
vals = [r.get("ret_1w") or 0 for r in materials_sorted]
cols = ["#16a34a" if v >= 0 else "#dc2626" for v in vals]

fig, ax = plt.subplots(figsize=(8, 5))
y = range(len(labels))
ax.barh(y, vals, color=cols, alpha=0.85)
ax.set_yticks(list(y))
ax.set_yticklabels(labels, fontsize=8)
ax.invert_yaxis()
ax.axvline(0, color="#444", lw=0.6)
for i, v in enumerate(vals):
    ax.text(v + (0.3 if v >= 0 else -0.3), i, f"{v:+.1f}%",
            va="center", ha="left" if v >= 0 else "right", fontsize=7)
ax.set_xlabel("1W return (%)")
ax.set_title("Exhibit 6 — Materials Bifurcation: Metals Lead, Chemicals Lag")
plt.tight_layout()
plt.savefig(f"{OUT}/06_materials_split.png", bbox_inches="tight")
plt.close()

print("Saved 6 charts to", OUT)
