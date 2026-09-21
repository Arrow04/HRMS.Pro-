"""Add configurable payroll columns: eps_rate, deduction caps, daily_rate_divisor, fy_start_month

Revision ID: a3b5c7d9e1f2
Revises: f4d7e8a2b1c3
Create Date: 2026-09-17 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a3b5c7d9e1f2'
down_revision: Union[str, Sequence[str], None] = 'f4d7e8a2b1c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # StatutorySetting — add eps_rate
    op.add_column('statutory_settings', sa.Column('eps_rate', sa.Float(), nullable=True))

    # TaxRegime — add deduction cap columns
    op.add_column('tax_regimes', sa.Column('section_80c_cap', sa.Float(), nullable=True))
    op.add_column('tax_regimes', sa.Column('section_80d_cap', sa.Float(), nullable=True))
    op.add_column('tax_regimes', sa.Column('section_80d_senior_cap', sa.Float(), nullable=True))
    op.add_column('tax_regimes', sa.Column('section_80ccd_1b_cap', sa.Float(), nullable=True))
    op.add_column('tax_regimes', sa.Column('section_24_home_loan_cap', sa.Float(), nullable=True))
    op.add_column('tax_regimes', sa.Column('section_80c_old_cap', sa.Float(), nullable=True))
    op.add_column('tax_regimes', sa.Column('hra_metro_pct', sa.Float(), nullable=True))
    op.add_column('tax_regimes', sa.Column('hra_non_metro_pct', sa.Float(), nullable=True))
    op.add_column('tax_regimes', sa.Column('hra_rent_threshold_pct', sa.Float(), nullable=True))
    op.add_column('tax_regimes', sa.Column('basic_pct_of_gross', sa.Float(), nullable=True))

    # PayrollPolicy — add daily_rate_divisor, fy_start_month, monthly_divisor_for_weekly
    op.add_column('payroll_policies', sa.Column('daily_rate_divisor', sa.Float(), nullable=True))
    op.add_column('payroll_policies', sa.Column('fy_start_month', sa.Integer(), nullable=True))
    op.add_column('payroll_policies', sa.Column('monthly_divisor_for_weekly', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('payroll_policies', 'monthly_divisor_for_weekly')
    op.drop_column('payroll_policies', 'fy_start_month')
    op.drop_column('payroll_policies', 'daily_rate_divisor')
    op.drop_column('tax_regimes', 'hra_rent_threshold_pct')
    op.drop_column('tax_regimes', 'hra_non_metro_pct')
    op.drop_column('tax_regimes', 'hra_metro_pct')
    op.drop_column('tax_regimes', 'section_80c_old_cap')
    op.drop_column('tax_regimes', 'section_24_home_loan_cap')
    op.drop_column('tax_regimes', 'section_80ccd_1b_cap')
    op.drop_column('tax_regimes', 'section_80d_senior_cap')
    op.drop_column('tax_regimes', 'section_80d_cap')
    op.drop_column('tax_regimes', 'section_80c_cap')
    op.drop_column('statutory_settings', 'eps_rate')
