"""One-off migration: grievances table (idempotent)."""
import database
from sqlalchemy import text

STMTS = [
    """CREATE TABLE IF NOT EXISTS grievances (
        id SERIAL PRIMARY KEY,
        subject VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(100) DEFAULT 'grievance',
        status VARCHAR(50) DEFAULT 'open',
        employee_id INTEGER,
        organization_id INTEGER,
        company_id INTEGER,
        resolution_notes TEXT,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS ix_grievances_status ON grievances (status)",
    "CREATE INDEX IF NOT EXISTS ix_grievances_employee ON grievances (employee_id)",
]

with database.engine.begin() as conn:
    for s in STMTS:
        conn.execute(text(s))
print("GRIEVANCE MIGRATION OK")
