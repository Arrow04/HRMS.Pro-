"""Add Organization.time_format column.

24-hour 'HH:mm' (default) or 12-hour 'hh:mm A' display format,
served alongside date_format from Settings > General.

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-09-24
"""
from alembic import op

revision = 'i9j0k1l2m3n4'
down_revision = 'h8i9j0k1l2m3'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS time_format VARCHAR(20) DEFAULT 'HH:mm'")


def downgrade():
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS time_format")
