"""One-off migration: notifications org scope + soft delete (idempotent)."""
import database
from sqlalchemy import text

STMTS = [
    "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS organization_id INTEGER",
    "ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
    "CREATE INDEX IF NOT EXISTS ix_notifications_org ON notifications (organization_id)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_deleted ON notifications (deleted_at)",
]

with database.engine.begin() as conn:
    for s in STMTS:
        conn.execute(text(s))
print("NOTIFICATIONS MIGRATION OK")
