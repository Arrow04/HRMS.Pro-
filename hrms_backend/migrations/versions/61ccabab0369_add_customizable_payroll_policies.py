"""add_customizable_payroll_policies

Revision ID: 61ccabab0369
Revises:
Create Date: 2026-07-24 23:30:58.037875
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '61ccabab0369'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── New tables (IF NOT EXISTS handles race with app create_all) ──
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS attendance_policies (
            id INTEGER NOT NULL PRIMARY KEY,
            organization_id INTEGER NOT NULL REFERENCES organizations(id),
            name VARCHAR(200), working_days_per_week INTEGER,
            half_day_as_full_paid BOOLEAN, paid_leave_as_present BOOLEAN,
            holiday_as_present BOOLEAN, overtime_threshold_hours FLOAT,
            overtime_rate FLOAT, late_mark_threshold_minutes INTEGER,
            half_day_threshold_hours FLOAT, status VARCHAR(20),
            created_at DATETIME, updated_at DATETIME
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_attendance_policies_org ON attendance_policies(organization_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_attendance_policies_status ON attendance_policies(status)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS payroll_policies (
            id INTEGER NOT NULL PRIMARY KEY,
            organization_id INTEGER NOT NULL REFERENCES organizations(id),
            name VARCHAR(200), pro_ration_method VARCHAR(50),
            rounding_method VARCHAR(20), decimal_places INTEGER,
            round_net_salary BOOLEAN, include_gratuity BOOLEAN,
            gratuity_rate FLOAT, default_currency VARCHAR(10),
            allow_negative_net BOOLEAN, status VARCHAR(20),
            created_at DATETIME, updated_at DATETIME
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_payroll_policies_org ON payroll_policies(organization_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_payroll_policies_status ON payroll_policies(status)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tax_regimes (
            id INTEGER NOT NULL PRIMARY KEY,
            organization_id INTEGER NOT NULL REFERENCES organizations(id),
            name VARCHAR(200) NOT NULL, regime_type VARCHAR(20),
            is_active BOOLEAN, is_default BOOLEAN, financial_year VARCHAR(20),
            standard_deduction FLOAT, rebate_threshold FLOAT,
            rebate_amount FLOAT, cess_rate FLOAT, surcharge_config JSON,
            status VARCHAR(20), created_at DATETIME, updated_at DATETIME
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_tax_regimes_org ON tax_regimes(organization_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_tax_regimes_status ON tax_regimes(status)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS payroll_components (
            id INTEGER NOT NULL PRIMARY KEY,
            organization_id INTEGER NOT NULL REFERENCES organizations(id),
            payroll_policy_id INTEGER REFERENCES payroll_policies(id),
            name VARCHAR(200) NOT NULL, display_name VARCHAR(200),
            component_type VARCHAR(50) NOT NULL, calculation_type VARCHAR(50) NOT NULL,
            calculation_base VARCHAR(200), calculation_value FLOAT,
            formula TEXT, max_cap FLOAT, min_cap FLOAT,
            is_statutory BOOLEAN, is_taxable BOOLEAN, is_tax_exempt BOOLEAN,
            tax_exempt_limit FLOAT, apply_pro_ration BOOLEAN,
            is_active BOOLEAN, is_system BOOLEAN, priority INTEGER,
            depends_on JSON, status VARCHAR(20),
            created_at DATETIME, updated_at DATETIME
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_payroll_components_org ON payroll_components(organization_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_payroll_components_policy ON payroll_components(payroll_policy_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_payroll_components_status ON payroll_components(status)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS statutory_settings (
            id INTEGER NOT NULL PRIMARY KEY,
            organization_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id),
            pf_applicable BOOLEAN, pf_employee_rate FLOAT, pf_employer_rate FLOAT,
            pf_max_monthly FLOAT, pf_min_basic_for_exclusion FLOAT,
            esi_applicable BOOLEAN, esi_employee_rate FLOAT, esi_employer_rate FLOAT,
            esi_gross_ceiling FLOAT, pt_applicable BOOLEAN,
            pt_monthly_amount FLOAT, pt_min_gross FLOAT,
            lwf_applicable BOOLEAN, lwf_employee_rate FLOAT, lwf_employer_rate FLOAT,
            gratuity_applicable BOOLEAN, gratuity_rate FLOAT,
            status VARCHAR(20), created_at DATETIME, updated_at DATETIME
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_statutory_settings_org ON statutory_settings(organization_id)"))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_statutory_settings_status ON statutory_settings(status)"))

    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS tax_slabs (
            id INTEGER NOT NULL PRIMARY KEY,
            tax_regime_id INTEGER NOT NULL REFERENCES tax_regimes(id),
            from_amount FLOAT NOT NULL, to_amount FLOAT,
            rate FLOAT NOT NULL, sort_order INTEGER, created_at DATETIME
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_tax_slabs_regime ON tax_slabs(tax_regime_id)"))

    # ── Add columns to existing tables (SQLite batch mode) ──
    with op.batch_alter_table('employees', schema=None) as batch_op:
        inspector = sa.inspect(conn)
        emp_cols = [c['name'] for c in inspector.get_columns('employees')]
        if 'salary_template_id' not in emp_cols:
            batch_op.add_column(sa.Column('salary_template_id', sa.Integer(), nullable=True))
            batch_op.create_index('ix_employees_salary_template_id', ['salary_template_id'])
        if 'payroll_policy_id' not in emp_cols:
            batch_op.add_column(sa.Column('payroll_policy_id', sa.Integer(), nullable=True))
            batch_op.create_index('ix_employees_payroll_policy_id', ['payroll_policy_id'])
        if 'attendance_policy_id' not in emp_cols:
            batch_op.add_column(sa.Column('attendance_policy_id', sa.Integer(), nullable=True))
            batch_op.create_index('ix_employees_attendance_policy_id', ['attendance_policy_id'])
        if 'tax_regime_id' not in emp_cols:
            batch_op.add_column(sa.Column('tax_regime_id', sa.Integer(), nullable=True))
            batch_op.create_index('ix_employees_tax_regime_id', ['tax_regime_id'])

    with op.batch_alter_table('organizations', schema=None) as batch_op:
        inspector = sa.inspect(conn)
        org_cols = [c['name'] for c in inspector.get_columns('organizations')]
        if 'default_payroll_policy_id' not in org_cols:
            batch_op.add_column(sa.Column('default_payroll_policy_id', sa.Integer(), nullable=True))
        if 'default_attendance_policy_id' not in org_cols:
            batch_op.add_column(sa.Column('default_attendance_policy_id', sa.Integer(), nullable=True))
        if 'default_tax_regime_id' not in org_cols:
            batch_op.add_column(sa.Column('default_tax_regime_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    for table in ('tax_slabs', 'statutory_settings', 'payroll_components',
                  'tax_regimes', 'payroll_policies', 'attendance_policies'):
        conn.execute(sa.text(f"DROP TABLE IF EXISTS {table}"))

    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.drop_column('default_tax_regime_id')
        batch_op.drop_column('default_attendance_policy_id')
        batch_op.drop_column('default_payroll_policy_id')

    with op.batch_alter_table('employees', schema=None) as batch_op:
        batch_op.drop_column('tax_regime_id')
        batch_op.drop_column('attendance_policy_id')
        batch_op.drop_column('payroll_policy_id')
        batch_op.drop_column('salary_template_id')
