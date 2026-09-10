"""One-off migration: grievance priority + assignee (idempotent)."""
import database
from sqlalchemy import text

STMTS = [
    "ALTER TABLE grievances ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium'",
    "ALTER TABLE grievances ADD COLUMN IF NOT EXISTS assigned_to INTEGER",
    "CREATE INDEX IF NOT EXISTS ix_grievances_priority ON grievances (priority)",
]

with database.engine.begin() as conn:
    for s in STMTS:
        conn.execute(text(s))
print("GRIEVANCE EXT MIGRATION OK")
