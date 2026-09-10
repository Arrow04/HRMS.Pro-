"""Consolidate portal, helpdesk, letters-era schema changes.

Merges heads a1b2c3d4e5f6 + add_reporting_manager_to_employees.
Every statement is idempotent (IF NOT EXISTS / information_schema guards)
so it applies cleanly on fresh databases and on databases that received
the ad-hoc migrate_*.py scripts.
"""

from alembic import op

revision = "c9d4e5f6a7b8"
down_revision = ("a1b2c3d4e5f6", "add_reporting_manager_to_employees")


def upgrade():
    op.execute("ALTER TABLE job_portal_users ADD COLUMN IF NOT EXISTS profile_type VARCHAR(20) DEFAULT 'experienced'")
    op.execute("ALTER TABLE job_portal_users ADD COLUMN IF NOT EXISTS hourly_rate_min INTEGER")
    op.execute("ALTER TABLE job_portal_users ADD COLUMN IF NOT EXISTS hourly_rate_max INTEGER")
    op.execute("ALTER TABLE job_portal_users ADD COLUMN IF NOT EXISTS availability VARCHAR(100)")
    op.execute("ALTER TABLE job_portal_users ADD COLUMN IF NOT EXISTS services JSON")
    op.execute("CREATE INDEX IF NOT EXISTS ix_portal_users_ptype ON job_portal_users (profile_type)")

    op.execute(
        "DO $$ BEGIN "
        "IF EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_name = 'job_portal_applications' AND column_name = 'applicant_id' AND is_nullable = 'NO') THEN "
        "ALTER TABLE job_portal_applications ALTER COLUMN applicant_id DROP NOT NULL; "
        "END IF; END $$"
    )

    op.execute(
        """CREATE TABLE IF NOT EXISTS job_portal_alerts (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            search VARCHAR(255),
            location VARCHAR(255),
            remote_only BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            last_checked_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )"""
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_portal_alerts_email ON job_portal_alerts (email)")

    op.execute(
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
        )"""
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_tickets_status ON support_tickets (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_tickets_employee ON support_tickets (employee_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_tickets_category ON support_tickets (category)")

    op.execute(
        """CREATE TABLE IF NOT EXISTS grievances (
            id SERIAL PRIMARY KEY,
            subject VARCHAR(255) NOT NULL,
            description TEXT,
            type VARCHAR(100) DEFAULT 'grievance',
            status VARCHAR(50) DEFAULT 'open',
            priority VARCHAR(20) DEFAULT 'medium',
            employee_id INTEGER,
            assigned_to INTEGER,
            organization_id INTEGER,
            company_id INTEGER,
            resolution_notes TEXT,
            resolved_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            deleted_at TIMESTAMP
        )"""
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_grievances_status ON grievances (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_grievances_employee ON grievances (employee_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_grievances_priority ON grievances (priority)")

    op.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS organization_id INTEGER")
    op.execute("ALTER TABLE notifications ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notifications_org ON notifications (organization_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notifications_deleted ON notifications (deleted_at)")

    op.execute(
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
        )"""
    )
    op.execute(
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
        )"""
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_proposals_gig ON job_portal_proposals (gig_id)")
    op.execute(
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
        )"""
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_contracts_gig ON job_portal_contracts (gig_id)")
    op.execute(
        """CREATE TABLE IF NOT EXISTS job_portal_milestones (
            id SERIAL PRIMARY KEY,
            contract_id INTEGER NOT NULL,
            title VARCHAR(255) NOT NULL,
            amount INTEGER NOT NULL,
            status VARCHAR(50) DEFAULT 'pending',
            due_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )"""
    )
    op.execute(
        """CREATE TABLE IF NOT EXISTS job_portal_reviews (
            id SERIAL PRIMARY KEY,
            contract_id INTEGER NOT NULL,
            reviewer_id INTEGER,
            reviewee_id INTEGER,
            reviewee_name VARCHAR(255),
            rating INTEGER NOT NULL,
            comment TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )"""
    )


def downgrade():
    pass
