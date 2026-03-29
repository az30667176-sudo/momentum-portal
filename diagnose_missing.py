"""
diagnose_missing.py
找出 stock_universe 裡有、但 daily_stock_returns 裡沒有的 ticker

執行：
  cd momentum-portal
  venv\Scripts\activate
  python diagnose_missing.py
"""
import os, sys
from pathlib import Path
from dotenv import load_dotenv

_root = Path(__file__).resolve().parent
load_dotenv(dotenv_path=_root / ".env")
sys.path.insert(0, str(_root))

from pipeline.writer import init_supabase

supabase = init_supabase()

# 1. 取得 stock_universe 所有 is_active tickers
uni = supabase.from_("stock_universe").select("ticker, gics_code").eq("is_active", True).limit(2000).execute()
universe_tickers = {r["ticker"] for r in uni.data}
print(f"stock_universe active tickers: {len(universe_tickers)}")

# 2. 取得 daily_stock_returns 最新日期
latest = supabase.from_("daily_stock_returns").select("date").order("date", desc=True).limit(1).execute()
if not latest.data:
    print("daily_stock_returns is empty!")
    sys.exit(1)
latest_date = latest.data[0]["date"]
print(f"Latest date in daily_stock_returns: {latest_date}")

# 3. 取得該日期所有 tickers
ret = supabase.from_("daily_stock_returns").select("ticker").eq("date", latest_date).limit(2000).execute()
returns_tickers = {r["ticker"] for r in ret.data}
print(f"daily_stock_returns tickers for {latest_date}: {len(returns_tickers)}")

# 4. 找出缺失的 tickers
missing = universe_tickers - returns_tickers
extra  = returns_tickers - universe_tickers
print(f"\nIn stock_universe but NOT in daily_stock_returns ({len(missing)}):")
for t in sorted(missing):
    print(f"  {t}")

if extra:
    print(f"\nIn daily_stock_returns but NOT in stock_universe ({len(extra)}):")
    for t in sorted(extra):
        print(f"  {t}")

# 5. 用 yfinance 驗證缺失 ticker 是否可下載
if missing:
    print(f"\nTesting yfinance for missing tickers...")
    import yfinance as yf
    for t in sorted(missing)[:10]:  # 只測前 10 個
        try:
            d = yf.download(t, period="5d", auto_adjust=True, progress=False)
            if d.empty:
                print(f"  {t}: yfinance returned EMPTY")
            else:
                print(f"  {t}: yfinance OK ({len(d)} days, last close={d['Close'].iloc[-1].values[0]:.2f})")
        except Exception as e:
            print(f"  {t}: yfinance ERROR: {e}")
