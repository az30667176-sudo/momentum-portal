# Momentum Portal — 專案參考文件

> 本文件記錄已完成專案的技術棧、架構、操作指令與已知問題。
> 最後更新：2026-04-11（互動式圖表 + 週報寫作規範）

---

## 專案概述

S&P 1500 × GICS Sub-industry 動能研究 Portal。
- **資料層**：Python pipeline，每日從 yfinance 抓資料，計算量化指標，寫入 Supabase
- **排程層**：GitHub Actions，美東時間每日盤後自動執行（UTC 21:30 週一到週五）
- **前端層**：Next.js 14 App Router，部署在 Vercel（公開可見，GitHub repo 私有）
- **功能（NavBar 4 個 tab）**：
  - `/`「產業總覽」：155 格 sub-industry heatmap
  - `/stocks`「個股排名」：依 Sub-industry heatmap + 報酬排名表（可按欄位排序）
  - `/backtest`「回測專區」：策略回測引擎（含篩選器、回測、即時訊號 / Preset 管理）
  - `/research`「研究分享」：3 個子分頁
    - `/research/weekly`「輪動週報」：列表 + 詳情頁，內容由 `content/research/weekly/*.json` 驅動
    - `/research/stock`「個股想法」：placeholder（敬請期待）
    - `/research/sector`「產業分享」：placeholder（敬請期待）
  - `/sub/[gicsCode]`：Sub-industry 詳頁（不在 NavBar，從 heatmap 點擊進入）

---

## 技術棧（已驗證版本）

### Python Pipeline
| 套件 | 版本 | 說明 |
|------|------|------|
| Python | 3.14.3 | Windows |
| yfinance | ≥0.2.50 | 股價下載 |
| pandas | ≥2.2.0 | 資料處理 |
| numpy | ≥2.0.0 | 數值計算 |
| supabase | ==2.9.1 | **必須固定** 2.9.1，較新版拉入 pyiceberg 需要 C++ 編譯器 |
| python-dotenv | ≥1.0.0 | 環境變數 |
| requests | ≥2.31.0 | Wikipedia 爬取 |
| scipy | ≥1.13.0 | 統計計算 |
| html5lib | ≥1.1 | Wikipedia HTML 解析 |
| psycopg[binary] | ≥3.1 | 直連 PostgreSQL（DDL 用，不在 requirements.txt）|
| matplotlib | ≥3.10 | 週報圖表（`scripts/make_charts.py`，不在 requirements.txt）|

### Frontend
| 套件 | 版本 |
|------|------|
| Next.js | 14.2.5 |
| React | ^18 |
| TypeScript | ^5 |
| Tailwind CSS | ^3.4 |
| @supabase/supabase-js | ^2.45 |
| recharts | ^2.12 |

---

## 目錄結構

```
all-weather-usStock-portal/
├── CLAUDE.md                    # 本文件
├── fix_universe.py              # 一次性修正腳本（已執行完畢）
├── create_tables.py             # 一次性建表腳本（已執行完畢）
├── migrate_stock_returns.py     # 一次性 DDL：加 ret_6m/ret_12m（已執行完畢）
└── momentum-portal/
    ├── .env                     # SUPABASE_URL, SUPABASE_SERVICE_KEY（不 commit）
    ├── requirements.txt
    ├── venv/                    # Python 虛擬環境
    ├── .github/
    │   └── workflows/
    │       └── pipeline.yml     # 每日 UTC 21:30（美東 17:30）自動執行
    ├── pipeline/
    │   ├── __init__.py
    │   ├── universe.py          # 抓 Wikipedia S&P 1500 成分股
    │   ├── fetcher.py           # yfinance 批次下載價格（含個別 retry 補抓機制）
    │   ├── calculator.py        # 計算報酬、動能分數、排名
    │   ├── volume.py            # OBV Trend、RVol、Vol Momentum、PV Divergence
    │   ├── writer.py            # Supabase upsert（帶 retry 和 sanitize）
    │   └── main.py              # Pipeline 主程式
    ├── migrate_presets.py       # 一次性 DDL：建立 backtest_presets 表（已執行完畢）
    ├── scripts/                 # 週報/產業分享圖表產生流程（手動執行）
    │   ├── fetch_weekly_rotation.py  # 從 Supabase 拉最近 ~20 天 daily_sub_returns + universe → scripts/rot.json
    │   ├── analyze_rotation.py       # 讀 rot.json，輸出板塊/排名/廣度文字摘要
    │   ├── make_charts.py            # 產生 6 張週報 PNG 圖表 → scripts/charts/*.png
    │   ├── make_sector_charts.py     # 產生產業分享靜態 PNG → frontend/public/research/sector/<slug>/
    │   └── charts/              # 週報圖表暫存（複製到 frontend/public/weekly/<date>/ 後即可刪）
    └── frontend/
        ├── .env.local           # SUPABASE_URL, SUPABASE_SERVICE_KEY（不 commit）
        ├── package.json
        ├── next.config.js       # typescript.ignoreBuildErrors: true
        ├── postcss.config.js    # Tailwind/autoprefixer（Vercel 必要）
        ├── tailwind.config.ts
        ├── app/
        │   ├── layout.tsx       # 全域 layout，掛 NavBar
        │   ├── page.tsx         # /「產業總覽」→ Heatmap（revalidate = 0）
        │   ├── stocks/page.tsx  # /stocks「個股排名」→ StockRanking（revalidate = 0）
        │   ├── backtest/page.tsx # /backtest「回測專區」→ BacktestEngine
        │   ├── research/        # /research「研究分享」
        │   │   ├── layout.tsx           # 共用標題 + ResearchSubNav
        │   │   ├── page.tsx             # redirect → /research/weekly
        │   │   ├── weekly/page.tsx      # 輪動週報列表（讀 content/research/weekly/*.json）
        │   │   ├── weekly/[slug]/page.tsx # 單期文章（force-static + generateStaticParams）
        │   │   ├── stock/page.tsx       # 個股想法 placeholder
        │   │   ├── sector/page.tsx      # 產業分享列表頁
        │   │   └── sector/[slug]/page.tsx # 產業分享詳情頁（force-static + generateStaticParams）
        │   ├── sub/[gicsCode]/page.tsx  # Sub-industry 詳頁 → SubDetail（revalidate = 0）
        │   └── api/
        │       ├── dry-scan/route.ts        # 回測：掃描符合條件的 sub
        │       ├── run-backtest/route.ts    # 回測：完整 backtest
        │       ├── run-robustness/route.ts  # 回測：穩健性測試
        │       ├── scan-signal/route.ts     # 即時訊號掃描（最近一個週五）
        │       └── presets/route.ts         # backtest preset GET/POST/DELETE
        ├── components/
        │   ├── NavBar.tsx       # 4 個 tab：產業總覽 / 個股排名 / 回測專區 / 研究分享
        │   ├── ResearchSubNav.tsx # /research 三個子分頁切換
        │   ├── ExhibitChart.tsx  # 互動式圖表（recharts hbar/scatter），點擊跳 /sub/ 或 /stock/
        │   ├── WeeklyMarkdown.tsx # JSON 內 **bold** / `code` 的迷你 inline renderer
        │   ├── StockHeatmap.tsx # ~1,500 格個股 heatmap（在 /stocks 的「依Sub-industry分類」tab 使用）
        │   ├── Heatmap.tsx      # 155 格 sub-industry heatmap（首頁使用）
        │   ├── StockRanking.tsx # 個股排名（依Sub-industry heatmap + 報酬排名表，可排序）
        │   ├── SubDetail.tsx    # 排名走勢、量化圖表、個股排名表
        │   ├── QuantPanel.tsx   # 16 個量化指標卡片
        │   └── BacktestEngine.tsx # 策略回測引擎 UI（含 Preset 管理 + 即時訊號 tab）
        ├── content/
        │   └── research/
        │       ├── weekly/
        │       │   ├── 2026-04-03.json  # 第 1 期「反彈裡的兩個錯位」
        │       │   └── 2026-04-10.json  # 第 2 期「停火行情的贏家與輸家」
        │       └── sector/
        │           └── heavy-electrical-equipment.json  # 重電產業分析
        ├── public/
        │   └── research/
        │       └── weekly/
        │           ├── 2026-04-03/      # 第 1 期的 6 張 PNG（01_*.png ~ 06_*.png）
        │           └── 2026-04-10/      # 第 2 期的 6 張 PNG
        └── lib/
            ├── types.ts         # TypeScript 型別定義（含 BacktestPreset, ScanSignalResult）
            ├── supabase.ts      # Server-side Supabase 查詢函式（分頁查詢）
            ├── research.ts      # research JSON 讀檔 helper（getAllIssues / getIssue / getAllSlugs）
            └── backtestEngine.ts # 回測 + 即時訊號的資料抓取與計算邏輯（Server-side）
```

---

## Supabase 資料庫

**Project ID**: `vxhupgvaynfnsvoexlqj`
**URL**: `https://vxhupgvaynfnsvoexlqj.supabase.co`

### 資料表

#### `gics_universe`
| 欄位 | 型別 | 說明 |
|------|------|------|
| gics_code | text PK | MD5(sector_subindustry)[:8].upper() |
| sector | text | GICS Sector |
| sub_industry | text UNIQUE | GICS Sub-Industry |
| updated_at | timestamptz | 自動更新 |

#### `stock_universe`
| 欄位 | 型別 | 說明 |
|------|------|------|
| ticker | text PK | 股票代碼（BRK.B → BRK-B）|
| company | text | 公司名稱 |
| gics_code | text FK→gics_universe | |
| index_member | text | SP500/SP400/SP600 |
| is_active | boolean | |
| updated_at | timestamptz | |

#### `daily_sub_returns`
| 欄位 | 型別 | 說明 |
|------|------|------|
| date | date PK part | |
| gics_code | text PK part → gics_universe | |
| ret_1d/1w/1m/3m/6m/12m | float8 | 報酬率（%）|
| mom_6m/mom_12m | float8 | Skip-month 動能（%）|
| mom_score | float8 | 0–100 綜合動能分數 |
| rank_today | int | 截面排名（1=最強）|
| rank_prev_week | int | 上週排名 |
| delta_rank | int | 排名變化（正=進步）|
| stock_count | int | 有效成分股數 |
| obv_trend | float8 | OBV 斜率（標準化）|
| rvol | float8 | 相對成交量（今/均）|
| vol_mom | float8 | 成交量動能（近/前期）|
| pv_divergence | text | confirmed/price_vol_neg/capitulation/weak |
| breadth_pct | float8 | 暫未計算 |
| sharpe_8w 等風險指標 | float8 | 暫未計算 |

#### `daily_stock_returns`
| 欄位 | 型別 | 說明 |
|------|------|------|
| date | date PK part | |
| ticker | text PK part | |
| gics_code | text FK→gics_universe | |
| ret_1d/1w/1m/3m/6m/12m | float8 | 報酬率（%）｜**ret_6m/ret_12m 為 2026-03-29 後加入** |
| mom_score | float8 | 動能分數（截面 Z-score，0–100）|
| rank_in_sub | int | 在同 sub-industry 的排名（1=最強）|
| rvol | float8 | 相對成交量 |

#### `backtest_presets`（2026-04 新增）
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | bigserial PK | |
| name | text UNIQUE | preset 名稱（upsert onConflict: 'name'）|
| config | jsonb | 完整 `BacktestConfig`（filters, rebal, weighting, SL/TP 等）|
| created_at | timestamptz | |
| updated_at | timestamptz | |

### 資料量（截至 2026-04-07）
- gics_universe: 155–156 rows
- stock_universe: ~1,506 rows（is_active = true）
- daily_sub_returns: ~3 年歷史（回測引擎抓取範圍）
- daily_stock_returns: ~1,500 rows/天（每日 pipeline 寫入）

---

## Pipeline 架構

### 執行方式
```bash
cd momentum-portal
venv\Scripts\activate

# 一般模式（只跑今天）
python pipeline/main.py

# 強制重跑今天（同時略過「非交易日」和「資料已存在」兩道檢查）
set FORCE_RERUN=true && python pipeline/main.py

# 回填 52 週歷史（首次執行）
python pipeline/main.py --backfill
```

### 資料流
1. `universe.py` → Wikipedia 抓 S&P 500/400/600，合併去重（SP500 優先）
2. `fetcher.py` → yfinance 批次下載 420 天收盤價和成交量；批次遺漏的 ticker 逐一補抓
3. `calculator.py` → 計算 ret_1d~12m、skip-month mom_6m/12m、截面 z-score 動能分數、排名
4. `volume.py` → OBV Trend、RVol、Vol Momentum、PV Divergence
5. `main.py` → 個股 ret_6m/ret_12m 組裝後，跑截面 `calc_momentum_score()` 計算 stock-level mom_score
6. `writer.py` → upsert 到 Supabase（分批 100 筆，最多 retry 3 次）

### gics_code 生成規則
```python
import hashlib
gics_code = hashlib.md5(f"{sector}_{sub_industry}".encode()).hexdigest()[:8].upper()
```
**重要**：同一個 sub_industry 必須用相同的 sector 字串（以 `drop_duplicates(subset=["sub_industry"])` 後的值為準），否則 FK 違反。

---

## 前端架構

### 環境變數
`frontend/.env.local`：
```
SUPABASE_URL=https://vxhupgvaynfnsvoexlqj.supabase.co
SUPABASE_SERVICE_KEY=<service_role_key>
```

### 本機開發
```bash
cd momentum-portal/frontend
npm install
npm run dev          # http://localhost:3000
npm run build        # 確認建置無誤
```

### 頁面路由
| 路徑 | NavBar Tab | 說明 |
|------|------|------|
| `/` | 產業總覽 | Heatmap 首頁，155 格 sub-industry sector view |
| `/stocks` | 個股排名 | StockRanking：依 Sub-industry heatmap + 報酬排名表（可點欄位排序）|
| `/backtest` | 回測專區 | BacktestEngine：篩選器 + 回測 + 即時訊號 + Preset 管理 |
| `/research` | 研究分享 | redirect → `/research/weekly` |
| `/research/weekly` | 研究分享 ▸ 輪動週報 | 列表頁，讀 `content/research/weekly/*.json` |
| `/research/weekly/[slug]` | 研究分享 ▸ 輪動週報 | 詳情頁，`generateStaticParams` 預渲染所有期數 |
| `/research/stock` | 研究分享 ▸ 個股想法 | placeholder |
| `/research/sector` | 研究分享 ▸ 產業分享 | 列表頁，讀 `content/research/sector/*.json` |
| `/research/sector/[slug]` | 研究分享 ▸ 產業分享 | 詳情頁，`force-static` + `generateStaticParams` |
| `/sub/[gicsCode]` | （子頁）| Sub-industry 詳頁：走勢圖、量化指標、個股排名表 |
| `/stock/[ticker]` | （子頁）| 個股詳頁：K 線圖 + 副指標、報酬摘要、RVol（從 `/sub/` 點入）|

### StockHeatmap 時間窗口
`1D / 1W / 1M / 3M / 6M / 1Y`（已移除「動能」窗口）
每格 tile 顯示：報酬值 + ticker + Mom Score（`M:NN`）

### StockRanking 排名表
- 只有兩個 tab：**依 Sub-industry 分類**（含 StockHeatmap）、**報酬排名**
- 欄位：1W / 1M / 3M / 6M / 1Y / Mom Score，點欄位標題可切換升降排序
- Mom Score 顯示策略：優先用 stock-level `mom_score`，null 時 fallback 到同 sub-industry 的 `mom_score`

### Supabase 查詢注意事項
PostgREST 預設 server-side 1,000-row 上限，`.limit()` 在 client 端設定會被覆蓋。
凡是查詢超過 1,000 筆的資料表，一律使用 `.range()` 分頁：
```typescript
const [page1, page2] = await Promise.all([
  supabase.from('table').select('...').range(0, 999),
  supabase.from('table').select('...').range(1000, 1999),
])
const data = [...(page1.data ?? []), ...(page2.data ?? [])]
```
目前 `stock_universe`（~1,506 rows）和 `daily_stock_returns`（~1,500 rows/天）均已套用此模式。

### ISR 快取
目前所有頁面設定 `export const revalidate = 0`（停用 ISR 快取），每次請求都從 Supabase 拉最新資料。
若未來要加快頁面速度，可改回 `revalidate = 300`（5 分鐘快取）。

---

## 回測引擎（BacktestEngine）

### 架構
- `BacktestEngine.tsx`：前端 UI（Client Component），含 4 個 tab：篩選 / 回測 / 穩健性 / 即時訊號
- `/api/dry-scan`：掃描符合條件的 sub-industry（maxDuration=30s）
- `/api/run-backtest`：完整回測（maxDuration=60s）
- `/api/run-robustness`：穩健性測試
- `/api/scan-signal`：即時訊號掃描（POST `{ config }` → `ScanSignalResult`，maxDuration=60s）
- `/api/presets`：preset CRUD（GET 列表 / POST upsert by name / DELETE ?id=）
- `lib/backtestEngine.ts`：Server-side 資料抓取 + 計算邏輯（含 `runSignalScan()`）

### 即時訊號 / Preset 管理（2026-04 新增）
回測專區的「📅 即時訊號」tab 提供兩段功能：
1. **Preset 管理**：把當前 `BacktestConfig` 用一個名字存到 `backtest_presets` 表，未來可一鍵載入
2. **掃描最近一個週五的訊號**：用當前 config 對最近交易日跑一次 single-day 篩選 + 排名 + 選股 + 計算權重，再用 Yahoo Finance Chart API（`query1.finance.yahoo.com/v8/finance/chart`）抓最新收盤價，回傳每檔候選股的：
   - sub-industry / ticker / 權重
   - 入場價（最新收盤）
   - 停損絕對價（`entryPrice * (1 + stopLossPct/100)`，stopLossPct 為負）
   - 停利絕對價（`entryPrice * (1 + takeProfitPct/100)`）

**Yahoo ticker 轉換**：`BRK.B → BRK-B`（`ticker.replace('.', '-')`）

**最近週五計算（UTC）**：`if (dow >= 5) delta = dow - 5; else delta = dow + 2`，再從 sub history 找 ≤ 該日的最近交易日當作 `scanDate`

### 資料抓取策略（backtestEngine.ts）
回測需要抓取 `daily_sub_returns` 全量歷史（3 年，~120K rows），用 OFFSET-based 分頁：

```typescript
const CHUNK = 10000
const BATCH = 2   // 2 concurrent queries（折衷：1 太慢超 Vercel 60s；3 會 DB timeout）
const MAX_CHUNKS = 20
```

**注意事項**：
- `BATCH=3`：Supabase free tier 多個並行 OFFSET 掃描互相競爭，導致 statement timeout
- `BATCH=1`：循序查詢太慢（12+ queries），超過 Vercel 60 秒限制
- `BATCH=2`：目前可用的折衷值，~6 batches × 2 queries = ~12–18 秒
- 回測 sub history 使用 `unstable_cache`（5 分鐘），cache key `sub-history-v4`

---

## 研究分享 / 輪動週報（/research）

### 目的
每週產出一篇結合 portal 量化訊號 + 公開新聞的板塊輪動分析文章，仿 Goldman Sachs *US Weekly Kickstart* 的「1 個 thesis + 多個 exhibit + 操作清單」結構。

### 路由架構（List + Detail，內容由 JSON 驅動）
- `/research` → redirect 到 `/research/weekly`
- `/research/weekly`：列表頁，讀 `frontend/content/research/weekly/*.json`，按日期 desc 顯示縮圖 + 標題 + 副標 + 日期
- `/research/weekly/[slug]`：詳情頁，`force-static` + `generateStaticParams`（所有 JSON 在 build 時全部預渲染）
- `/research/stock`：個股想法（placeholder）
- `/research/sector`：產業分享列表頁，讀 `frontend/content/research/sector/*.json`
- `/research/sector/[slug]`：產業分享詳情頁，`force-static` + `generateStaticParams`
- 全域共用：`app/research/layout.tsx` 提供標題 + `ResearchSubNav`

### 內容 JSON Schema（`frontend/lib/research.ts` 的 `ResearchIssue`）
```ts
{
  slug: "2026-04-03",                       // 等同檔名
  issue: 1,                                  // 第幾期
  date: "2026-04-03",                        // 內容當週日期
  snapshotDate: "2026-04-06",                // portal 快照日
  title: "反彈裡的兩個錯位",
  subtitle: "一句副標",
  imageDir: "/research/weekly/2026-04-03",   // public 路徑
  coverImage: "01_sector_1w.png",            // 列表縮圖（通常 = 圖一）
  intro: ["第一段...", "第二段...", ...],    // 開場 N 段
  exhibits: [{
    number, title, image, caption, body,
    links?: [{ label, href }],              // 圖下方綠色可點標籤（連到 /sub/ 或 /stock/）
    chartData?: { type, items, ... }         // 有此欄位 → 渲染互動式 recharts 取代靜態 PNG
  }, ...],
  actions: ["操作 1", "操作 2", ...],        // 下一次 rebal 的具體動作
  sources: [{ title, url }, ...]             // 新聞來源
}
```
JSON 內的 `intro / exhibits.body / actions` 字串支援 inline `**bold**` 和 `` `code` `` 兩種 markup（由 `components/WeeklyMarkdown.tsx` 的 `<Inline>` 渲染）。

### 互動式圖表架構（2026-04-11 新增）

每個 exhibit 可包含 `chartData` 欄位，有此欄位時前端會用 `components/ExhibitChart.tsx`（recharts，`'use client'`，`next/dynamic` lazy load）渲染互動式圖表取代靜態 PNG。點擊任一資料點可跳到對應的 `/sub/[gicsCode]` 或 `/stock/[ticker]` 頁面。

**核心原則：互動式圖表只用於 portal 資料**
- 圖表資料來自 portal（sub-industry / 個股數據）且每個資料點可連結到 `/sub/` 或 `/stock/` 頁面 → 用 `chartData`（互動式）
- 圖表資料來自外部來源（產業報告、公司財報、宏觀數據）→ 用 matplotlib 產靜態 PNG（`image` 欄位）
- 不要把外部數據硬塞進 `chartData`，點了跳到不相關的頁面只會讓使用者困惑

**支援的圖表類型**：
| type | 用途 | items 欄位 |
|------|------|------|
| `hbar` | 水平條形圖 | `{ label, value, href }` + 可選 `xLabel?, xUnit?` |
| `scatter` | 散點圖 | `{ label, x, y, href, color? }` + `xLabel, yLabel, quadrants?, colorLabels?` |

`hbar` 預設 X 軸標籤 `1W return (%)`、單位 `%`。若資料不是百分比報酬，必須設定 `xLabel` 和 `xUnit`（例：`"xLabel": "交期（週）", "xUnit": " 週"`）。

`scatter` 的 `colorLabels` 欄位用於自訂圖例標籤（`Record<hexColor, label>`），避免 fallback 到 hardcoded "Other"。

**非互動式圖表的 href 處理**：若 `href` 為空字串 `""`，ExhibitChart 不會顯示手型游標和「點擊任一列可查看詳情」提示。

**gics_code 計算**（用於 `href` 欄位）：
```python
import hashlib
gics_code = hashlib.md5(f"{sector}_{sub_industry}".encode()).hexdigest()[:8].upper()
# 例：Copper → /sub/9D3B3E86
```
**注意**：sector 名稱必須與 `gics_universe` 表中的 sector 一致（不是直覺的分類）。寫 JSON 前用 Python 計算並驗證 DB 存在。

**除了 `chartData`，也保留 `links` 欄位**：在圖片/圖表下方顯示綠色可點標籤（pill chips），連到相關的 sub/stock 頁面。互動式圖表和靜態 PNG 都可同時有 `links`。

### 主題與 UX
- 強制 light mode：`<main>` 寫死 `bg-white text-black`，全頁面不使用任何 `dark:` 變體。原因是 root layout 沒設深色背景，手機系統開暗色會白底白字
- 寬度 `max-w-3xl`，類似 Substack / Medium
- 圖片用 `next/image` 的 `unoptimized` 跳過 Vercel 圖片優化
- 標題格式：`第 N 期 · <文章標題>`

### 圖表產出流程（手動，目前 3 個獨立 script）
```bash
cd momentum-portal
venv/Scripts/python.exe scripts/fetch_weekly_rotation.py 1>scripts/rot.json 2>scripts/rot.err
PYTHONIOENCODING=utf-8 venv/Scripts/python.exe scripts/analyze_rotation.py   # 印文字摘要供寫稿參考
venv/Scripts/python.exe scripts/make_charts.py                                # 產生 6 張 PNG → scripts/charts/
mkdir -p frontend/public/research/weekly/<YYYY-MM-DD>
cp scripts/charts/*.png frontend/public/research/weekly/<YYYY-MM-DD>/
# 然後新增 frontend/content/research/weekly/<YYYY-MM-DD>.json（schema 見上）
# 不需要動任何 React 程式碼 — 列表頁自動排序、詳情頁靠 generateStaticParams 自動渲染
```

### 6 張 Exhibit 的固定槽位
| 編號 | 檔名 | 互動 | 內容 |
|------|------|------|------|
| 1 | `01_sector_1w.png` | 靜態 | 板塊一週報酬條形圖（11 sector，無對應詳情頁） |
| 2 | `02_rotation_map.png` | 靜態 | 1W vs 3M 散點圖（sector 層級，無對應詳情頁） |
| 3 | `03_top_bottom_subs.png` | `hbar` | 單週最強最弱 12 個次產業，點擊跳 `/sub/` |
| 4 | `04_energy_unwind.png` | `scatter` | mom_score top-20 散點，橘=能源/藍=其他，點擊跳 `/sub/` |
| 5 | `05_rank_delta.png` | `hbar` | `delta_rank` Top/Bottom 10，點擊跳 `/sub/` |
| 6 | `06_materials_split.png` | `hbar` | 原物料板塊內部金屬 vs 化學，點擊跳 `/sub/` |

### 週報寫作規範（2026-04-11 定版）

**定位**：給客戶看的專業研究報告，仿 Goldman Sachs *US Weekly Kickstart*。

**結構要求**：
1. **單一 thesis 貫穿全文**：每期只有一個核心判斷，6 張圖從不同角度支撐同一條主線。不能「見人說人話、見鬼說鬼話」—— 不能圖三說一個故事、圖四說另一個故事。
2. **跨期敘事連貫**：intro 第一段必須回顧上週的核心判斷，說明本週是驗證還是推翻。每張圖的 body 應引用上週同一張圖的觀察做對比（例：「上週說 X，本週 Y 驗證了這個判斷」）。
3. **actions 第一條永遠是績效回顧**：用 ✓/✗ 逐條檢視上週建議的本週表現，附具體數字。這是建立信任的關鍵。
4. **不能有被打臉的語氣**：即使上週判斷被市場否定，也要用專業口吻解釋為什麼分析框架仍然有效、配置需要如何修正。不說「我錯了」，說「配置需要調整」。

**口吻**：
- 中文為主，口語化但專業。不要英文句構的翻譯腔。
- 可用少量英文術語（`mom_score`、`delta_rank`、`risk-on`）但不要整句英文。
- 簡潔有力，每個段落都要有 insight，不要流水帳描述數據。
- 從 portal 數據 × 新聞產生 insight，不是純看圖說故事。

**chartData 填寫規則（週報）**：
- 圖 3、5、6 為 `hbar` 類型：從 `make_charts.py` 產出的 PNG 讀取數值，填入 `items`
- 圖 4 為 `scatter` 類型：從 `analyze_rotation.py` 的文字摘要或 PNG 讀取 mom_score 和 1W return
- 每個 `href` 必須用 Python `hashlib.md5(f"{sector}_{sub_industry}".encode()).hexdigest()[:8].upper()` 計算，並在 Supabase `gics_universe` 驗證存在
- 圖 1、2 不加 `chartData`（sector 層級無對應頁面）

### 產業分享（/research/sector）— 2026-04-11 新增

**架構**：與週報共用 `ResearchIssue` schema + `ExhibitChart` 元件。每篇文章是一個 JSON 檔 + 靜態圖檔。
- JSON 路徑：`frontend/content/research/sector/<slug>.json`
- 圖檔路徑：`frontend/public/research/sector/<slug>/`
- `imageDir` 格式：`/research/sector/<slug>`

**圖表策略（互動 vs 靜態）**：
- **Portal 量化數據**（sub-industry 報酬、排名、mom_score 等）→ 用 `chartData`（互動式 recharts），`href` 指向 `/sub/[gicsCode]`
- **外部產業數據**（公司財報、交期、capex、裝機量等）→ 用 `scripts/make_sector_charts.py` 產 matplotlib 靜態 PNG，`image` 欄位指向 PNG 檔名
- 同一篇文章可混用兩種：例如前 3 張圖互動式（portal 數據）、後 3 張圖靜態（產業基本面）

**產業分享圖表產出流程**：
```bash
cd momentum-portal
# 編輯 scripts/make_sector_charts.py（依文章需求客製圖表）
PYTHONIOENCODING=utf-8 venv/Scripts/python.exe scripts/make_sector_charts.py
# PNG 自動存到 frontend/public/research/sector/<slug>/
# 然後新增 frontend/content/research/sector/<slug>.json
```

**matplotlib 中文字型**：已驗證 `Microsoft JhengHei`（微軟正黑體）在 Windows 可正常渲染中文標題和標籤。

**已有文章**：
- `heavy-electrical-equipment`：重電產業分析（GEV/AZZ），6 張 exhibit（前 3 互動 + 後 3 靜態 PNG）

### 已知 limitation / 下一步
- 自動化策略：選擇 **本機 Windows Task Scheduler 排程**，每週六早上呼叫 Claude Code 自動跑寫稿 → commit → push（吃 Max 額度，不付 API 錢）。**目前尚未實作**，仍然手動觸發 Claude Code session 來寫稿
- 個股想法（`/research/stock`）目前只有 placeholder 頁

---

## GitHub Actions

**Repo**: `az30667176-sudo/momentum-portal`（私有）
**排程**: `30 21 * * 1-5`（UTC 21:30 週一到週五 = 美東 17:30，收盤後 1.5 小時）
**Secrets 已設定**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`

手動觸發：GitHub → Actions → Daily Data Pipeline → Run workflow
- `force_rerun: true`：強制重跑今天（略過「非交易日」和「資料已存在」兩道檢查）
- `backfill: true`：回填 52 週歷史（首次執行用）

---

## 已知問題與修正記錄

### 1. Wikipedia 403 Forbidden
- **原因**：`pd.read_html(url)` 使用 Python 預設 User-Agent，被 Wikipedia 封鎖
- **修正**：改用 `requests.get(url, headers=WIKI_HEADERS)` 帶瀏覽器 UA，再 `pd.read_html(StringIO(resp.text))`

### 2. `No module named 'pipeline'`
- **原因**：`python pipeline/main.py` 把 `pipeline/` 加入 sys.path，破壞 package import
- **修正**：main.py 頂部 `sys.path.insert(0, str(Path(__file__).resolve().parent.parent))`

### 3. Windows cp1252 Unicode 錯誤
- **原因**：logging handler 無法編碼 `→` 字元
- **修正**：`open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)`

### 4. Supabase NaN JSON 序列化失敗
- **原因**：pandas 計算產生 `float('nan')`，JSON 無法序列化
- **修正**：`writer.py` 的 `_sanitize()` 把 NaN/Inf 換成 None

### 5. gics_code FK 違反
- **原因**：不同 Wikipedia 頁面對同一 sub_industry 用不同 sector 名稱，導致每筆股票 hashlib 計算出不同 gics_code
- **修正**：建立 canonical `sub_to_gics_code` dict，以 `drop_duplicates(subset=["sub_industry"])` 後的 sector 為準

### 6. supabase>=2.3.4 安裝失敗
- **原因**：新版拉入 pyiceberg，需要 C++ 編譯器
- **修正**：固定 `supabase==2.9.1`

### 7. Vercel 前端 CSS 完全失效
- **原因**：缺少 `postcss.config.js`，Tailwind 在 Vercel 建置時無法編譯
- **修正**：新增 `frontend/postcss.config.js`（`tailwindcss` + `autoprefixer`）

### 8. TypeScript 建置錯誤（`type Window` 衝突）
- **原因**：`StockHeatmap.tsx` 和 `Heatmap.tsx` 內定義的 `type Window` 與瀏覽器全域 `Window` 衝突
- **修正**：重新命名為 `TimeWindow`（StockHeatmap）和 `SubWindow`（Heatmap）；另在 `next.config.js` 加入 `typescript: { ignoreBuildErrors: true }` 防止 TS 錯誤擋住 Vercel 建置

### 9. Supabase 1,000-row server-side 上限導致個股資料不完整
- **原因**：PostgREST 預設 server-side 限制 1,000 rows，`.limit(2000)` 在 client 端設定無效；`stock_universe`（1,501 rows）和 `daily_stock_returns`（1,500 rows）各自只回傳 1,000 筆（不同子集），導致 ~316 支個股顯示「—」
- **修正**：`supabase.ts` 的 `getStockHeatmap()` 改用兩段平行 `.range()` 查詢（0–999 和 1000–1999）拼接完整資料

### 10. yfinance 批次下載靜默遺漏部分 ticker
- **原因**：`yf.download(batch)` 多 ticker 下載有時靜默丟棄個別 ticker
- **修正**：`fetcher.py` 下載完成後比對預期 vs 實際 tickers，遺漏者逐一重試補抓

### 11. GitHub Actions 排程時間錯誤
- **原因**：原本 `30 1 * * 2-6`（UTC 01:30）距收盤超過 5 小時
- **修正**：改為 `30 21 * * 1-5`（UTC 21:30 = 美東 17:30，收盤後 1.5 小時）

### 12. 個股 6M/1Y 報酬及 Mom Score 顯示「—」
- **原因**：`daily_stock_returns` 缺少 `ret_6m`/`ret_12m` 欄位；pipeline 的 `mom_score` 寫死為 None
- **修正**：
  1. 執行 `migrate_stock_returns.py`（ALTER TABLE 加欄位）
  2. `main.py` 加入 `ret_6m`/`ret_12m` 並跑截面 `calc_momentum_score()` 計算 stock-level mom_score
  3. `lib/types.ts` 加入 `ret_6m`/`ret_12m` 到 `StockReturn` 和 `StockHeatmapEntry`
  4. `supabase.ts` 的 `getStockHeatmap()` retSelect 改為 `'*'`

### 13. FORCE_RERUN=true 仍被「非交易日」擋住
- **原因**：`FORCE_RERUN=true` 只略過「資料已存在」檢查，未略過 `is_market_open_today()`
- **修正**：`main.py` 在最頂部讀取 `force_rerun_early`，同時略過兩道檢查

### 14. 回測引擎 statement timeout（第 2、3 次執行）
- **原因**：`backtestEngine.ts` 原用 `BATCH=3` 並行 OFFSET 查詢，多個並行掃描競爭 Supabase free tier 連線池
- **修正**：改為 `BATCH=2`（折衷：BATCH=1 太慢超 Vercel 60s；BATCH=3 讓 DB timeout）

### 15. 回測圖表等權Top20曲線扭曲 Y 軸
- **原因**：等權 Top20 累積報酬達 ~1200%，使策略線和 SPY 線視覺上無法辨讀
- **修正**：移除 `BacktestEngine.tsx` 中的 `ewCurve` Line component

### 16. 週報頁手機顯示一片白
- **原因**：原本用 `text-gray-700 dark:text-gray-300` 等 dark mode 變體，但 root layout 沒設深色背景。手機系統開暗色 → 文字變白、背景仍白 → 白底白字看不見
- **修正**：`/weekly` 頁鎖死 light mode：`<main>` 加 `bg-white text-black min-h-screen`，所有 `dark:*` 變體全部移除

### 17. yfinance 寫入隔夜資料失敗（pipeline 重跑後資料還是舊的）
- **原因**：盤後 GitHub Actions 跑 pipeline 時，yfinance 偶爾還沒提供當日收盤價（特別是美東 17:30 排程剛好卡邊界），但 pipeline 仍會把舊一日的價格當「今日」寫入
- **修正**：`pipeline/main.py` 在抓完價格後比對 `close_to_date.index.max().date() < target_date`，若 yfinance 還沒到位就直接 return 不寫入，等下次排程重試

---

## 常見問題

**Q: yfinance 被限流（429）**
把 `fetcher.py` 的 `SLEEP_BETWEEN` 改成 3.0，`BATCH_SIZE` 改成 30。

**Q: Supabase upsert 外鍵錯誤**
確認 gics_universe 已先 upsert，且 gics_code 計算方式與 stock_universe 一致。

**Q: 前端 TypeScript 錯誤擋住 Vercel 建置**
`next.config.js` 已設定 `typescript: { ignoreBuildErrors: true }`，正常不影響建置。
若要查看具體錯誤，在本機執行 `npm run build`。

**Q: 前端看不到資料**
確認 `frontend/.env.local` 已設定 SUPABASE_URL 和 SUPABASE_SERVICE_KEY。

**Q: 個股顯示「—」**
- 確認 `daily_stock_returns` 當天有資料（pipeline 有跑）
- 確認 `supabase.ts` 的查詢使用 `.range()` 分頁（非 `.limit()`），以繞過 1,000-row 上限

**Q: 回測 timeout / 回測只顯示 1 年資料**
- `CHUNK × MAX_CHUNKS` 必須 ≥ DB 實際 row 數（3年 × 155 sub × 260天 ≈ 120K rows）
- 目前設定：`CHUNK=10000, MAX_CHUNKS=20`（上限 200K rows）
- 若再次 timeout：考慮 `BATCH=1`（超慢但穩）或改用 Supabase Edge Function 直連 PostgreSQL

**Q: 新增風險指標（sharpe_8w 等）**
目前這些欄位在 DB 存在但值為 null。需要在 `calculator.py` 的 `aggregate_sub_industry()` 加入計算，並在 `main.py` 的 `run_pipeline_for_date()` 組裝 record 時加入對應欄位。

**Q: 出新一期週報**（Claude Code 半自動 SOP — 使用者只需說「跑這週的週報」）

> 自動化策略：階段 A — Claude Code 互動式半自動。使用者每週六（或 ad-hoc）打開 Claude Code 講「跑這週的週報」，由 Claude 照下面流程跑完，使用者審稿後叫 Claude commit + push。**完全吃 Max 額度，零 API 錢。**未來文章品質穩定後再考慮升級到 Claude Agent SDK / GitHub Actions 全自動。

**Step 1：抓資料 + 產圖**
```bash
cd momentum-portal
venv/Scripts/python.exe scripts/fetch_weekly_rotation.py 1>scripts/rot.json 2>scripts/rot.err
PYTHONIOENCODING=utf-8 venv/Scripts/python.exe scripts/analyze_rotation.py   # 看文字摘要
venv/Scripts/python.exe scripts/make_charts.py                                # 產生 6 張 PNG
```

**Step 2：讀過去 3 期 JSON 當參考**
- `ls frontend/content/research/weekly/*.json | sort | tail -3`，逐個 Read
- 重點看：上週的 thesis 是什麼？actions 是什麼？以維持「承接感」
- 寫稿時要做到：
  - 如果上週的 thesis 已被市場驗證 / 失效，明白指出
  - 如果某個 actions 延續上週，要說「續上週」
  - 如果是新增/減碼，要說「調整」
  - 避免重複論述，避免每週都當第一次寫

**Step 3：抓本週新聞（WebSearch）**
- 主題範圍：油價 / OPEC / Fed / CPI / PPI / 主要板塊事件 / 個別大事
- 優先用 Bloomberg、CNBC、Morningstar、S&P Global、JPMorgan、EIA、Schwab 等大來源
- 把所有引用都列在 `sources` 欄位

**Step 4：寫 JSON**
- 路徑：`frontend/content/research/weekly/<本週週五日期>.json`
- 模板：複製上一期 JSON，依 `lib/research.ts` 的 `ResearchIssue` schema 改寫
- 必填欄位：`slug`、`issue`（上期 + 1）、`date`、`snapshotDate`、`title`、`subtitle`、`imageDir`、`coverImage`、`intro`、`exhibits`、`actions`、`sources`
- 字串內可用 `**bold**` 和 `` `code` `` markup（由 `<Inline>` 渲染）
- `imageDir` 格式：`/research/weekly/<日期>`
- **互動圖表**：圖 3/4/5/6 必須填寫 `chartData` + `links`。圖 1/2 只需 `links`（無 `chartData`）
  - 用 Python 計算每個 sub-industry 的 gics_code 並驗證 DB 存在
  - 從 PNG 圖表讀取數值填入 `items`
- **寫作規範**：遵循「週報寫作規範」section 的所有要求（單一 thesis、跨期連貫、績效回顧、專業口吻）

**Step 5：複製圖檔到 public**
```bash
mkdir -p frontend/public/research/weekly/<新日期>
cp scripts/charts/*.png frontend/public/research/weekly/<新日期>/
```

**Step 6：等使用者審稿**
- Claude 跑完 Step 1–5 後**先停下來**，讓使用者打開本機 dev server 或上傳 Vercel preview 看效果
- 使用者說「OK」之後 Claude 才執行 Step 7

**Step 7：commit + push**
```bash
git add -A frontend/content/research/weekly/ frontend/public/research/weekly/
git commit -m "feat(weekly): add issue N — <title>"
git push
```
Vercel 自動部署。不用改任何 React 程式碼。

**Q: 週報頁手機看不到字**
`/research/weekly/*` 已鎖 light mode（`bg-white text-black`）。如果未來新增段落務必避免 `dark:*` 變體，否則手機暗色系統會白底白字。

**Q: 即時訊號掃出來價格全部 null**
Yahoo Finance Chart API 對 `BRK.B` 這類 ticker 不認，需在 fetch 前轉成 `BRK-B`（已在 `runSignalScan` 中處理）。如果還是 null，可能是 Yahoo 對 IP 限流，可重試或加 sleep。
