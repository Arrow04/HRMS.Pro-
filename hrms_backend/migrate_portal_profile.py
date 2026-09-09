"""One-off migration: portal profile columns + alerts table (idempotent)."""
import database
from sqlalchemy import text

STMTS = [
    "ALTER TABLE job_portal_users ADD COLUMN IF NOT EXISTS profile_type VARCHAR(20) DEFAULT 'experienced'",
    "ALTER TABLE job_portal_users ADD COLUMN IF NOT EXISTS hourly_rate_min INTEGER",
    "ALTER TABLE job_portal_users ADD COLUMN IF NOT EXISTS hourly_rate_max INTEGER",
    "ALTER TABLE job_portal_users ADD COLUMN IF NOT EXISTS availability VARCHAR(100)",
    "ALTER TABLE job_portal_users ADD COLUMN IF NOT EXISTS services JSON",
    """CREATE TABLE IF NOT EXISTS job_portal_alerts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        search VARCHAR(255),
        location VARCHAR(255),
        remote_only BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        last_checked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS ix_portal_alerts_email ON job_portal_alerts (email)",
    "CREATE INDEX IF NOT EXISTS ix_portal_users_ptype ON job_portal_users (profile_type)",
]

with database.engine.begin() as conn:
    for s in STMTS:
        conn.execute(text(s))
print("MIGRATION OK")
