"""
migrate_stock_returns.py
Add ret_6m and ret_12m columns to daily_stock_returns.
Run once: python migrate_stock_returns.py
"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
if not DATABASE_URL:
    # Construct from known Supabase project ID — user must supply DB password
    project = "vxhupgvaynfnsvoexlqj"
    db_password = os.environ.get("SUPABASE_DB_PASSWORD", "")
    DATABASE_URL = (
        f"postgresql://postgres.{project}:{db_password}"
        f"@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
    )

SQL = """
ALTER TABLE public.daily_stock_returns
    ADD COLUMN IF NOT EXISTS ret_6m  NUMERIC(10,4),
    ADD COLUMN IF NOT EXISTS ret_12m NUMERIC(10,4);

COMMENT ON COLUMN public.daily_stock_returns.ret_6m  IS '6 個月報酬率 (%)';
COMMENT ON COLUMN public.daily_stock_returns.ret_12m IS '12 個月報酬率 (%)';
"""

if __name__ == "__main__":
    print(f"Connecting to Supabase…")
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(SQL)
        conn.commit()
    print("Migration complete: ret_6m and ret_12m added to daily_stock_returns.")
