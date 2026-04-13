# Momentum Portal

> S&P 1500 × GICS Sub-industry 動能研究平台

自動化追蹤 155 個 GICS 次產業的動能訊號，結合量化排名與基本面研究，產出可操作的板塊輪動策略。

**Live Site** → [momentum-portal.vercel.app](https://momentum-portal-qae8t48yr-az30667176-sudos-projects.vercel.app/)

---

## Features

| 功能 | 說明 |
|------|------|
| **產業總覽** | 155 格 sub-industry heatmap，一眼看出板塊強弱 |
| **個股排名** | ~1,500 檔 S&P 1500 成分股，依動能分數排序 |
| **回測引擎** | 多因子篩選 + 歷史回測 + Optuna 參數優化 + 即時訊號 |
| **研究分享** | 輪動週報、產業分析、個股 memo — 量化 × 基本面 |

## Architecture

```
                    ┌─────────────┐
                    │  Wikipedia  │  S&P 1500 成分股
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   yfinance  │  每日收盤價 + 成交量
                    └──────┬──────┘
                           │
  ┌────────────────────────▼────────────────────────┐
  │              Python Pipeline                     │
  │  universe → fetcher → calculator → volume → writer│
  └────────────────────────┬────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  Supabase   │  PostgreSQL
                    │  (DB + API) │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  Next.js 14 │  App Router
                    │   + Vercel  │
                    └─────────────┘
```

## Tech Stack

| Layer | Stack |
|-------|-------|
| Data Pipeline | Python 3.14 · yfinance · pandas · numpy · scipy |
| Database | Supabase (PostgreSQL + PostgREST) |
| Scheduling | GitHub Actions — UTC 21:30 Mon–Fri |
| Frontend | Next.js 14 · React 18 · TypeScript · Tailwind CSS · Recharts |
| Deployment | Vercel (auto-deploy on push) |

## Data Pipeline

每日美東收盤後自動執行：

1. **Universe** — 從 Wikipedia 抓取 S&P 500/400/600 成分股，合併去重
2. **Fetcher** — yfinance 批次下載 420 天收盤價與成交量
3. **Calculator** — 計算 1D~12M 報酬率、skip-month 動能、截面 Z-score、排名
4. **Volume** — OBV Trend、RVol、Vol Momentum、PV Divergence
5. **Writer** — Upsert 到 Supabase（分批 100 筆，含 retry）

```bash
# 手動執行
cd momentum-portal
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
python pipeline/main.py

# 強制重跑（略過交易日 + 資料存在檢查）
FORCE_RERUN=true python pipeline/main.py
```

## Frontend

```bash
cd momentum-portal/frontend
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
```

### 環境變數

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
```

## Research Content

研究文章以 JSON 驅動，不需改動 React 程式碼：

```
frontend/content/research/
├── weekly/          # 輪動週報 — 每週一期
│   ├── 2026-04-03.json
│   └── 2026-04-10.json
├── sector/          # 產業分析
│   └── heavy-electrical-equipment.json
└── stock/           # 個股 memo
    ├── cvx-2026-04-07.json
    └── fti-2026-04-12.json
```

新增文章只需放 JSON + 圖檔，`generateStaticParams` 自動渲染。

## License

Private repository. All rights reserved.
