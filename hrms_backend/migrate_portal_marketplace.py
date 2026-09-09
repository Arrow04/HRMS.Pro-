"""One-off migration: gig marketplace tables (idempotent)."""
import database
from sqlalchemy import text

STMTS = [
    """CREATE TABLE IF NOT EXISTS job_portal_gigs (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE,
        description TEXT NOT NULL,
        deliverables TEXT,
        category VARCHAR(100),
        skills_required JSON,
        budget_min INTEGER,
        budget_max INTEGER,
        budget_type VARCHAR(20) DEFAULT 'fixed',
        delivery_days INTEGER,
        client_id INTEGER,
        client_name VARCHAR(255),
        location VARCHAR(255),
        is_remote BOOLEAN DEFAULT TRUE,
        status VARCHAR(50) DEFAULT 'open',
        is_featured BOOLEAN DEFAULT FALSE,
        view_count INTEGER DEFAULT 0,
        proposal_count INTEGER DEFAULT 0,
        published_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS job_portal_proposals (
        id SERIAL PRIMARY KEY,
        gig_id INTEGER NOT NULL,
        freelancer_id INTEGER,
        freelancer_name VARCHAR(255),
        cover_letter TEXT NOT NULL,
        bid_amount INTEGER NOT NULL,
        delivery_days INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS job_portal_contracts (
        id SERIAL PRIMARY KEY,
        gig_id INTEGER NOT NULL,
        proposal_id INTEGER,
        client_id INTEGER,
        freelancer_id INTEGER,
        freelancer_name VARCHAR(255),
        agreed_amount INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP
    )""",
    """CREATE TABLE IF NOT EXISTS job_portal_milestones (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER NOT NULL,
        title VARCHAR(255) NOT NULL,
        amount INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        due_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS job_portal_reviews (
        id SERIAL PRIMARY KEY,
        contract_id INTEGER NOT NULL,
        reviewer_id INTEGER,
        reviewee_id INTEGER,
        reviewee_name VARCHAR(255),
        rating INTEGER NOT NULL,
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
    )""",
    "CREATE INDEX IF NOT EXISTS ix_gigs_status ON job_portal_gigs (status)",
    "CREATE INDEX IF NOT EXISTS ix_gigs_category ON job_portal_gigs (category)",
    "CREATE INDEX IF NOT EXISTS ix_proposals_gig ON job_portal_proposals (gig_id)",
    "CREATE INDEX IF NOT EXISTS ix_contracts_gig ON job_portal_contracts (gig_id)",
]

with database.engine.begin() as conn:
    for s in STMTS:
        conn.execute(text(s))
print("MARKETPLACE MIGRATION OK")
