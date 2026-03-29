"""
migrate_new_indicators.py
ALTER TABLE daily_sub_returns — 新增 7 個均線與廣度指標欄位

執行方式（需在 momentum-portal/ 目錄下，並啟動 venv）：
  python migrate_new_indicators.py

新增欄位：
  price_vs_ma5    float8  -- 板塊等權指數 vs MA5 偏離%
  price_vs_ma20   float8  -- 板塊等權指數 vs MA20 偏離%
  price_vs_ma100  float8  -- 板塊等權指數 vs MA100 偏離%
  price_vs_ma200  float8  -- 板塊等權指數 vs MA200 偏離%
  breadth_20ma    float8  -- 個股站上 20MA 比例 (0-100%)
  breadth_50ma    float8  -- 個股站上 50MA 比例 (0-100%)
  high_proximity  float8  -- 距 52 週高點比例 (0-1)
"""

import os
import sys
from pathlib import Path

_root = Path(__file__).resolve().parent
sys.path.insert(0, str(_root))

from dotenv import load_dotenv
load_dotenv(dotenv_path=_root / ".env")

import psycopg

COLUMNS = [
    ("price_vs_ma5",   "float8"),
    ("price_vs_ma20",  "float8"),
    ("price_vs_ma100", "float8"),
    ("price_vs_ma200", "float8"),
    ("breadth_20ma",   "float8"),
    ("breadth_50ma",   "float8"),
    ("high_proximity", "float8"),
]

def main():
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        # 從 SUPABASE_URL 組裝 direct connection
        supabase_url = os.environ.get("SUPABASE_URL", "")
        service_key  = os.environ.get("SUPABASE_SERVICE_KEY", "")
        if not supabase_url:
            print("ERROR: SUPABASE_URL not set in .env")
            sys.exit(1)
        # Direct PostgreSQL URL for Supabase: postgres://postgres:<key>@db.<project>.supabase.co:5432/postgres
        project_id = supabase_url.split("//")[1].split(".")[0] if "//" in supabase_url else ""
        db_url = f"postgresql://postgres.{project_id}:{service_key}@aws-0-us-east-1.pooler.supabase.com:5432/postgres"

    print(f"Connecting to: {db_url[:60]}...")

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            for col, dtype in COLUMNS:
                try:
                    cur.execute(f"ALTER TABLE daily_sub_returns ADD COLUMN IF NOT EXISTS {col} {dtype};")
                    print(f"  ✓ Added column: {col} {dtype}")
                except Exception as e:
                    print(f"  ✗ Failed {col}: {e}")
        conn.commit()

    print("Migration complete.")

if __name__ == "__main__":
    main()
