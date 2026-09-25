"""NPS + perquisites columns (mandate sections 16, 22)

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'p6q7r8s9t0u1'
down_revision = 'o5p6q7r8s9t0'
branch_labels = None
depends_on = None

_EMPLOYEE_COLS = [
    ('pran_number', sa.Column('pran_number', sa.String(100), nullable=True)),
    ('nps_applicable', sa.Column('nps_applicable', sa.Boolean(), server_default=sa.false())),
]
_PAYROLL_COLS = [
    ('nps_deduction', sa.Column('nps_deduction', sa.Float(), server_default='0')),
    ('nps_employer_contribution', sa.Column('nps_employer_contribution', sa.Float(), server_default='0')),
    ('taxable_perquisites', sa.Column('taxable_perquisites', sa.Float(), server_default='0')),
]


def _apply(table, cols):
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c['name'] for c in inspector.get_columns(table)}
    add = [col for name, col in cols if name not in existing]
    if add:
        with op.batch_alter_table(table) as batch:
            for col in add:
                batch.add_column(col)


def upgrade():
    _apply('employees', _EMPLOYEE_COLS)
    _apply('payrolls', _PAYROLL_COLS)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table, cols in (('employees', _EMPLOYEE_COLS), ('payrolls', _PAYROLL_COLS)):
        existing = {c['name'] for c in inspector.get_columns(table)}
        drop = [col for name, col in cols if name in existing]
        if drop:
            with op.batch_alter_table(table) as batch:
                for col in drop:
                    batch.drop_column(col.name)
