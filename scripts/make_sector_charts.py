"""Generate static PNG charts for Heavy Electrical Equipment sector article."""
import matplotlib.pyplot as plt
import matplotlib
import numpy as np
import os

matplotlib.rcParams['font.sans-serif'] = ['Microsoft JhengHei', 'SimHei', 'Noto Sans CJK TC', 'Arial']
matplotlib.rcParams['axes.unicode_minus'] = False

OUT = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public', 'research', 'sector', 'heavy-electrical-equipment')
os.makedirs(OUT, exist_ok=True)

# ── Exhibit 4: Transformer Lead Times ──
fig, ax = plt.subplots(figsize=(10, 5))

years = ['2021', '2022', '2023', '2024', '2025', '2026']
power_tx = [50, 80, 100, 120, 128, 128]
dist_tx =  [35, 50, 100, 70,  40,  30]

x = np.arange(len(years))
w = 0.35

bars1 = ax.bar(x - w/2, power_tx, w, label='大型電力變壓器 (Power)', color='#ef4444', alpha=0.85)
bars2 = ax.bar(x + w/2, dist_tx, w, label='配電變壓器 (Distribution)', color='#3b82f6', alpha=0.85)

# Add value labels
for bar in bars1:
    h = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2, h + 2, f'{int(h)}週', ha='center', va='bottom', fontsize=9, color='#991b1b', fontweight='bold')
for bar in bars2:
    h = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2, h + 2, f'{int(h)}週', ha='center', va='bottom', fontsize=9, color='#1e40af', fontweight='bold')

# GSU annotation
ax.annotate('GSU 變壓器\n144 週', xy=(4.8, 128), xytext=(5.2, 145),
            fontsize=9, color='#991b1b', fontweight='bold',
            arrowprops=dict(arrowstyle='->', color='#991b1b', lw=1.5),
            ha='center', va='bottom',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#fef2f2', edgecolor='#fca5a5'))

ax.set_xticks(x)
ax.set_xticklabels(years, fontsize=11)
ax.set_ylabel('平均交期（週）', fontsize=11)
ax.set_ylim(0, 165)
ax.legend(loc='upper left', fontsize=10, framealpha=0.9)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.grid(axis='y', alpha=0.3)
ax.set_title('美國電力變壓器交期趨勢', fontsize=13, fontweight='bold', pad=12)

plt.tight_layout()
fig.savefig(os.path.join(OUT, '04_transformer_lead_times.png'), dpi=150, bbox_inches='tight', facecolor='white')
plt.close()
print('OK: 04_transformer_lead_times.png')


# ── Exhibit 5: GEV Segments ──
fig, ax = plt.subplots(figsize=(10, 5))

segments = ['Power\n(燃氣渦輪+核電)', 'Electrification\n(電網設備)', 'Wind\n(風力發電)']
rev_2025 = [20.0, 10.5, 7.6]
rev_2026 = [23.5, 13.8, 6.7]

x = np.arange(len(segments))
w = 0.35

bars1 = ax.bar(x - w/2, rev_2025, w, label='2025 實績', color='#6b7280', alpha=0.85)
bars2 = ax.bar(x + w/2, rev_2026, w, label='2026E 指引', color='#10b981', alpha=0.85)

for bar in bars1:
    h = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2, h + 0.3, f'${h:.1f}B', ha='center', va='bottom', fontsize=10, fontweight='bold', color='#374151')
for bar in bars2:
    h = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2, h + 0.3, f'${h:.1f}B', ha='center', va='bottom', fontsize=10, fontweight='bold', color='#065f46')

# Growth labels
for i, (a, b) in enumerate(zip(rev_2025, rev_2026)):
    pct = (b - a) / a * 100
    color = '#10b981' if pct > 0 else '#ef4444'
    sign = '+' if pct > 0 else ''
    ax.text(x[i] + w/2 + 0.08, max(a, b) + 0.3, f'{sign}{pct:.0f}%', ha='left', va='bottom', fontsize=9, color=color, fontweight='bold')

# Highlight Wind is losing money
ax.annotate('EBITDA 仍虧損\n~$4 億', xy=(2 + w/2, 6.7), xytext=(2.6, 10),
            fontsize=9, color='#dc2626',
            arrowprops=dict(arrowstyle='->', color='#dc2626', lw=1.2),
            ha='center',
            bbox=dict(boxstyle='round,pad=0.3', facecolor='#fef2f2', edgecolor='#fca5a5'))

ax.set_xticks(x)
ax.set_xticklabels(segments, fontsize=11)
ax.set_ylabel('營收（$B）', fontsize=11)
ax.set_ylim(0, 28)
ax.legend(loc='upper right', fontsize=10, framealpha=0.9)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.grid(axis='y', alpha=0.3)
ax.set_title('GE Vernova 三大部門營收：2025 vs 2026E', fontsize=13, fontweight='bold', pad=12)

# Total annotation
ax.text(0.02, 0.97, '合計：$38.1B → $44–45B (+16%)', transform=ax.transAxes,
        fontsize=10, va='top', color='#374151',
        bbox=dict(boxstyle='round,pad=0.4', facecolor='#f0fdf4', edgecolor='#86efac'))

plt.tight_layout()
fig.savefig(os.path.join(OUT, '05_gev_segments.png'), dpi=150, bbox_inches='tight', facecolor='white')
plt.close()
print('OK: 05_gev_segments.png')


# ── Exhibit 6: Grid Investment Super Cycle ──
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5), gridspec_kw={'width_ratios': [1.2, 1]})

# Left: Capex sources ($B)
categories = ['Utility Capex\n2026E', 'Utility Capex\n2025', 'IIJA\n電網撥款']
values = [222, 215, 73]
colors = ['#10b981', '#6b7280', '#3b82f6']

bars = ax1.barh(categories, values, color=colors, alpha=0.85, height=0.6)
for bar, v in zip(bars, values):
    ax1.text(bar.get_width() + 3, bar.get_y() + bar.get_height()/2, f'${v}B', ha='left', va='center', fontsize=11, fontweight='bold')

ax1.set_xlim(0, 270)
ax1.set_xlabel('金額（$B）', fontsize=10)
ax1.spines['top'].set_visible(False)
ax1.spines['right'].set_visible(False)
ax1.grid(axis='x', alpha=0.3)
ax1.set_title('資金來源', fontsize=12, fontweight='bold')
ax1.invert_yaxis()

# Right: Renewable additions (GW)
sources = ['太陽能', '儲能', '風電']
gw = [33, 18, 8]
colors2 = ['#f59e0b', '#8b5cf6', '#06b6d4']

bars2 = ax2.barh(sources, gw, color=colors2, alpha=0.85, height=0.5)
for bar, v in zip(bars2, gw):
    ax2.text(bar.get_width() + 0.5, bar.get_y() + bar.get_height()/2, f'{v} GW', ha='left', va='center', fontsize=11, fontweight='bold')

ax2.set_xlim(0, 42)
ax2.set_xlabel('2025 新增裝機量（GW）', fontsize=10)
ax2.spines['top'].set_visible(False)
ax2.spines['right'].set_visible(False)
ax2.grid(axis='x', alpha=0.3)
ax2.set_title('再生能源裝機（間接拉動電網需求）', fontsize=12, fontweight='bold')
ax2.invert_yaxis()

# Add total annotation
fig.text(0.5, -0.02, '2025–2030 累計電力基礎設施投資預計達 $1.4 兆', ha='center', fontsize=11, color='#374151', fontweight='bold',
         bbox=dict(boxstyle='round,pad=0.4', facecolor='#f0fdf4', edgecolor='#86efac'))

fig.suptitle('電網投資超級週期', fontsize=14, fontweight='bold', y=1.02)
plt.tight_layout()
fig.savefig(os.path.join(OUT, '06_grid_investment.png'), dpi=150, bbox_inches='tight', facecolor='white')
plt.close()
print('OK: 06_grid_investment.png')

print('\nDone! All 3 charts saved to:', OUT)
