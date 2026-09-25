"""Remove DATE_FORMAT lookup category.

Date formats are now a local list (hrms_react_web/src/utils/dateFormats.ts)
rendered by a token-based formatter on both frontend and backend, so the
4-value master-data category was dead code.

Revision ID: h8i9j0k1l2m3
Revises: f5g6h7i8j9k0
Create Date: 2026-09-24
"""
from alembic import op

revision = 'h8i9j0k1l2m3'
down_revision = 'f5g6h7i8j9k0'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        DELETE FROM lookup_values
        WHERE category_id IN (
            SELECT id FROM lookup_categories WHERE code = 'DATE_FORMAT'
        )
        """
    )
    op.execute("DELETE FROM lookup_categories WHERE code = 'DATE_FORMAT'")


def downgrade():
    # Defaults are re-seedable from routers/master_data.py history; no data restore.
    pass
