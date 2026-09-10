"""One-off migration: support_tickets table (idempotent)."""
import database
from sqlalchemy import text

STMTS = [
    """CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        ticket_no VARCHAR(50) UNIQUE,
        subject VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(50) DEFAULT 'general',
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(50) DEFAULT 'open',
        employee_id INTEGER,
        assigned_to INTEGER,
        resolution_notes TEXT,
        organization_id INTEGER,
        company_id INTEGER,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
    )""",
    "CREATE INDEX IF NOT EXISTS ix_support_tickets_status ON support_tickets (status)",
    "CREATE INDEX IF NOT EXISTS ix_support_tickets_employee ON support_tickets (employee_id)",
    "CREATE INDEX IF NOT EXISTS ix_support_tickets_category ON support_tickets (category)",
]

with database.engine.begin() as conn:
    for s in STMTS:
        conn.execute(text(s))
print("HELPDESK MIGRATION OK")
