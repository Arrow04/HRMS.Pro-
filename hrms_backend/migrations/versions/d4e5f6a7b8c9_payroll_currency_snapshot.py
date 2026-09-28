"""Payroll multi-currency snapshot columns.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('payrolls', sa.Column('salary_currency', sa.String(10), nullable=True))
    op.add_column('payrolls', sa.Column('currency_exchange_rate', sa.Float, nullable=True))

def downgrade():
    op.drop_column('payrolls', 'currency_exchange_rate')
    op.drop_column('payrolls', 'salary_currency')
