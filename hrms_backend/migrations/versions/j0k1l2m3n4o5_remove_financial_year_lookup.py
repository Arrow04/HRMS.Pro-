"""Remove FINANCIAL_YEAR lookup category.

Financial year start months are now a local list
(hrms_react_web/src/utils/dateFormats.ts), so the master-data category was
dead code.

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-09-24
"""
from alembic import op

revision = 'j0k1l2m3n4o5'
down_revision = 'i9j0k1l2m3n4'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        DELETE FROM lookup_values
        WHERE category_id IN (
            SELECT id FROM lookup_categories WHERE code = 'FINANCIAL_YEAR'
        )
        """
    )
    op.execute("DELETE FROM lookup_categories WHERE code = 'FINANCIAL_YEAR'")


def downgrade():
    # Defaults are re-seedable from routers/master_data.py history; no data restore.
    pass
