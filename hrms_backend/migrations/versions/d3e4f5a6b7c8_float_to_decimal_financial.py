"""Change financial Float columns to DECIMAL(12,2) for precision

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5g6h7
Create Date: 2026-09-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'd3e4f5a6b7c8'
down_revision = 'c2d3e4f5g6h7'
branch_labels = None
depends_on = None

FINANCIAL_COLUMNS = [
    ('employees', 'base_salary'),
    ('expenses', 'amount'),
    ('expenses', 'tax_amount'),
    ('payrolls', 'basic_salary'),
    ('payrolls', 'hra'),
    ('payrolls', 'da'),
    ('payrolls', 'conveyance'),
    ('payrolls', 'medical'),
    ('payrolls', 'special_allowance'),
    ('payrolls', 'gross_salary'),
    ('payrolls', 'overtime_pay'),
    ('payrolls', 'bonus'),
    ('payrolls', 'commission'),
    ('payrolls', 'incentive'),
    ('payrolls', 'other_earnings'),
    ('payrolls', 'total_earnings'),
    ('payrolls', 'pf_deduction'),
    ('payrolls', 'pf_employer_contribution'),
    ('payrolls', 'esi_deduction'),
    ('payrolls', 'esi_employer_contribution'),
    ('payrolls', 'professional_tax'),
    ('payrolls', 'lwf_deduction'),
    ('payrolls', 'gratuity'),
    ('payrolls', 'tds_deduction'),
    ('payrolls', 'income_tax'),
    ('payrolls', 'surcharge'),
    ('payrolls', 'cess'),
    ('payrolls', 'loan_deduction'),
    ('payrolls', 'advance_deduction'),
    ('payrolls', 'other_deductions'),
    ('payrolls', 'total_deductions'),
    ('payrolls', 'net_salary'),
    ('salary_revisions', 'base_salary'),
    ('salary_loans', 'principal_amount'),
    ('salary_loans', 'monthly_deduction'),
    ('assets', 'value'),
    ('assets', 'purchase_value'),
    ('assets', 'salvage_value'),
    ('journal_entries', 'debit'),
    ('journal_entries', 'credit'),
    ('exit_records', 'fnf_amount'),
]


def upgrade():
    conn = op.get_bind()
    for table, column in FINANCIAL_COLUMNS:
        try:
            # Check if table and column exist
            result = conn.execute(sa.text(
                f"SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='{table}' AND column_name='{column}')"
            ))
            exists = result.scalar()
            if exists:
                op.execute(sa.text(f'ALTER TABLE {table} ALTER COLUMN {column} TYPE NUMERIC(12,2) USING {column}::NUMERIC(12,2)'))
                print(f"  Converted {table}.{column} to NUMERIC(12,2)")
        except Exception as e:
            print(f"  Skipped {table}.{column}: {e}")


def downgrade():
    conn = op.get_bind()
    for table, column in FINANCIAL_COLUMNS:
        try:
            result = conn.execute(sa.text(
                f"SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='{table}' AND column_name='{column}')"
            ))
            exists = result.scalar()
            if exists:
                op.execute(sa.text(f'ALTER TABLE {table} ALTER COLUMN {column} TYPE DOUBLE PRECISION'))
                print(f"  Reverted {table}.{column} to DOUBLE PRECISION")
        except Exception as e:
            print(f"  Skipped {table}.{column}: {e}")
