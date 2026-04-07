"""
migrate_presets.py
Create backtest_presets table for saving named BacktestConfig snapshots
used by the "即時訊號" tab in the frontend.
Run once: python migrate_presets.py
"""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
if not DATABASE_URL:
    project = "vxhupgvaynfnsvoexlqj"
    db_password = os.environ.get("SUPABASE_DB_PASSWORD", "")
    DATABASE_URL = (
        f"postgresql://postgres.{project}:{db_password}"
        f"@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
    )

SQL = """
CREATE TABLE IF NOT EXISTS public.backtest_presets (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT        NOT NULL UNIQUE,
    config      JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.backtest_presets IS '使用者儲存的回測策略 preset（給「即時訊號」tab 使用）';
COMMENT ON COLUMN public.backtest_presets.name   IS '使用者命名的 preset 名稱';
COMMENT ON COLUMN public.backtest_presets.config IS '完整的 BacktestConfig JSON';
"""

if __name__ == "__main__":
    print("Connecting to Supabase…")
    with psycopg.connect(DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(SQL)
        conn.commit()
    print("Migration complete: backtest_presets created.")
