"""Remove COUNTRY, TIMEZONE, CURRENCY lookup categories.

These dropdowns are now served by the local country catalog
(hrms_react_web/src/utils/countryDefaults.ts + Intl APIs), so the
master-data categories were dead code.

Revision ID: f5g6h7i8j9k0
Revises: e4f5a6b7c8d9
Create Date: 2026-09-24
"""
from alembic import op

revision = 'f5g6h7i8j9k0'
down_revision = 'e4f5a6b7c8d9'
branch_labels = None
depends_on = None

REMOVED_CODES = ('COUNTRY', 'TIMEZONE', 'CURRENCY')


def upgrade():
    op.execute(
        """
        DELETE FROM lookup_values
        WHERE category_id IN (
            SELECT id FROM lookup_categories WHERE code IN ('COUNTRY', 'TIMEZONE', 'CURRENCY')
        )
        """
    )
    op.execute(
        "DELETE FROM lookup_categories WHERE code IN ('COUNTRY', 'TIMEZONE', 'CURRENCY')"
    )


def downgrade():
    # Defaults are re-seedable from routers/master_data.py history; no data restore.
    pass
