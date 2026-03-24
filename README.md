# Momentum Portal

S&P 1500 × 145 GICS Sub-industry 動能研究 Portal

## 架構
- Pipeline：Python + yfinance + Supabase
- 排程：GitHub Actions（每日盤後）
- 前端：Next.js 14 + Vercel

## 本機開發

1. 複製環境變數範本：`cp .env.example .env`
2. 填入 Supabase URL 和 Key
3. 建立虛擬環境：`python -m venv venv`
4. 啟動虛擬環境：`venv\Scripts\activate`（Windows）
5. 安裝套件：`pip install -r requirements.txt`
6. 執行 pipeline：`python pipeline/main.py`

## 前端

```bash
cd frontend
npm install
npm run dev
```
