# Momentum Portal

[![Daily Pipeline](https://github.com/az30667176-sudo/momentum-portal/actions/workflows/pipeline.yml/badge.svg)](https://github.com/az30667176-sudo/momentum-portal/actions/workflows/pipeline.yml)
[![Deploy](https://img.shields.io/badge/deploy-Vercel-black?logo=vercel)](https://momentum-portal-qae8t48yr-az30667176-sudos-projects.vercel.app/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

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

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- Supabase project (free tier works)

### Pipeline Setup

```bash
cd momentum-portal
cp .env.example .env          # fill in Supabase credentials
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python pipeline/main.py
```

### Frontend Setup

```bash
cd momentum-portal/frontend
cp .env.example .env.local    # fill in Supabase credentials
npm install
npm run dev                   # http://localhost:3000
```

### Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `SUPABASE_URL` | `.env` + `.env.local` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | `.env` + `.env.local` | Supabase service role key |
| `FORCE_RERUN` | `.env` (optional) | Skip trade-day & duplicate checks |

## Data Pipeline

每日美東收盤後由 GitHub Actions 自動執行：

1. **Universe** — 從 Wikipedia 抓取 S&P 500/400/600 成分股，合併去重
2. **Fetcher** — yfinance 批次下載 420 天收盤價與成交量
3. **Calculator** — 計算 1D~12M 報酬率、skip-month 動能、截面 Z-score、排名
4. **Volume** — OBV Trend、RVol、Vol Momentum、PV Divergence
5. **Writer** — Upsert 到 Supabase（分批 100 筆，含 retry）

## Research Content

研究文章以 JSON 驅動，不需改動 React 程式碼：

```
frontend/content/research/
├── weekly/          # 輪動週報 — 每週一期
├── sector/          # 產業分析
└── stock/           # 個股 memo
```

新增文章只需放 JSON + 圖檔，`generateStaticParams` 自動渲染。

## Project Structure

```
momentum-portal/
├── pipeline/            # Python data pipeline
│   ├── universe.py      # S&P 1500 constituent scraper
│   ├── fetcher.py       # yfinance price downloader
│   ├── calculator.py    # return & momentum calculator
│   ├── volume.py        # volume indicators
│   ├── writer.py        # Supabase upsert
│   └── main.py          # orchestrator
├── frontend/            # Next.js 14 app
│   ├── app/             # App Router pages
│   ├── components/      # React components
│   ├── lib/             # shared utilities
│   └── content/         # research JSON articles
├── scripts/             # chart generation scripts
└── .github/workflows/   # CI/CD
```

## License

[MIT](LICENSE)
