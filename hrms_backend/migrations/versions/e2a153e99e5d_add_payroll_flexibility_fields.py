"""add payroll flexibility fields: tiered overtime, shift differential, input variables, multi-currency, employee payroll inputs

Revision ID: e2a153e99e5d
Revises: a3b5c7d9e1f2
Create Date: 2026-09-17

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'e2a153e99e5d'
down_revision: Union[str, Sequence[str], None] = 'a3b5c7d9e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PayrollComponent: tiered_config, shift_differential_config, input_variables
    op.add_column('payroll_components', sa.Column('tiered_config', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('payroll_components', sa.Column('shift_differential_config', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('payroll_components', sa.Column('input_variables', postgresql.JSON(astext_type=sa.Text()), nullable=True))

    # AttendancePolicy: overtime_tiers, shift_differential_rates
    op.add_column('attendance_policies', sa.Column('overtime_tiers', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('attendance_policies', sa.Column('shift_differential_rates', postgresql.JSON(astext_type=sa.Text()), nullable=True))

    # PayrollPolicy: reporting_currency, allow_multi_currency
    op.add_column('payroll_policies', sa.Column('reporting_currency', sa.String(10), nullable=True))
    op.add_column('payroll_policies', sa.Column('allow_multi_currency', sa.Boolean(), server_default='false'))

    # Employee: salary_currency, currency_exchange_rate
    op.add_column('employees', sa.Column('salary_currency', sa.String(10), server_default='INR'))
    op.add_column('employees', sa.Column('currency_exchange_rate', sa.Float(), nullable=True))

    # EmployeePayrollInput table (idempotent — skip if already exists)
    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'employee_payroll_inputs')"))
    if not result.scalar():
        op.create_table(
            'employee_payroll_inputs',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=False, index=True),
            sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False, index=True),
            sa.Column('year', sa.Integer(), nullable=False),
            sa.Column('month', sa.Integer(), nullable=False),
            sa.Column('inputs', postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default='{}'),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
            sa.UniqueConstraint('employee_id', 'year', 'month', name='uq_emp_payroll_input_period'),
        )


def downgrade() -> None:
    op.drop_table('employee_payroll_inputs')
    op.drop_column('employees', 'currency_exchange_rate')
    op.drop_column('employees', 'salary_currency')
    op.drop_column('payroll_policies', 'allow_multi_currency')
    op.drop_column('payroll_policies', 'reporting_currency')
    op.drop_column('attendance_policies', 'shift_differential_rates')
    op.drop_column('attendance_policies', 'overtime_tiers')
    op.drop_column('payroll_components', 'input_variables')
    op.drop_column('payroll_components', 'shift_differential_config')
    op.drop_column('payroll_components', 'tiered_config')
