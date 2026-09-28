"""Payroll pending-ad-hoc flag (bonus/incentive recorded before the run)

Revision ID: z5a1b2c3d4e5
Revises: y5z0a1b2c3d4
Create Date: 2026-09-26
"""
from alembic import op
import sqlalchemy as sa

revision = 'z5a1b2c3d4e5'
down_revision = 'y5z0a1b2c3d4'
branch_labels = None
depends_on = None

COLUMN = sa.Column('is_pending_adhoc', sa.Boolean(), nullable=True, server_default=sa.text('false'))


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c['name'] for c in inspector.get_columns('payrolls')}
    if COLUMN.name not in cols:
        op.add_column('payrolls', COLUMN)
    # Existing rows: a payroll row that has no salary substance yet and was
    # created outside the engine is a pending-ad-hoc stub.
    op.execute(
        "UPDATE payrolls SET is_pending_adhoc = true "
        "WHERE deleted_at IS NULL "
        "AND COALESCE(basic_salary, 0) = 0 "
        "AND COALESCE(gross_salary, 0) = 0 "
        "AND (COALESCE(bonus, 0) > 0 OR COALESCE(incentive, 0) > 0 OR COALESCE(commission, 0) > 0)"
    )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c['name'] for c in inspector.get_columns('payrolls')}
    if COLUMN.name in cols:
        op.drop_column('payrolls', COLUMN.name)
