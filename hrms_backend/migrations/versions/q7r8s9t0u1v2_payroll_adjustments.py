"""Payroll adjustments: arrears/recovery for retroactive changes (33-34)

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'q7r8s9t0u1v2'
down_revision = 'p6q7r8s9t0u1'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'payroll_adjustments' in set(inspector.get_table_names()):
        return
    op.create_table(
        'payroll_adjustments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('payroll_id', sa.Integer(), sa.ForeignKey('payrolls.id'), nullable=True),
        sa.Column('source', sa.String(30), server_default='retro_rule'),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('from_month', sa.Integer(), nullable=False),
        sa.Column('from_year', sa.Integer(), nullable=False),
        sa.Column('to_month', sa.Integer(), nullable=False),
        sa.Column('to_year', sa.Integer(), nullable=False),
        sa.Column('rule_id', sa.Integer(), sa.ForeignKey('statutory_rules.id'), nullable=True),
        sa.Column('rule_version_old', sa.Integer(), nullable=True),
        sa.Column('rule_version_new', sa.Integer(), nullable=True),
        sa.Column('original', sa.JSON(), nullable=True),
        sa.Column('revised', sa.JSON(), nullable=True),
        sa.Column('gross_delta', sa.Float(), server_default='0'),
        sa.Column('deduction_delta', sa.Float(), server_default='0'),
        sa.Column('net_delta', sa.Float(), server_default='0'),
        sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('status', sa.String(20), server_default='draft'),
        sa.Column('applied_payroll_id', sa.Integer(), sa.ForeignKey('payrolls.id'), nullable=True),
        sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('applied_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_payroll_adjustments_organization_id', 'payroll_adjustments', ['organization_id'])
    op.create_index('ix_payroll_adjustments_employee_id', 'payroll_adjustments', ['employee_id'])
    op.create_index('ix_payroll_adjustments_status', 'payroll_adjustments', ['status'])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'payroll_adjustments' in set(inspector.get_table_names()):
        op.drop_index('ix_payroll_adjustments_status', table_name='payroll_adjustments')
        op.drop_index('ix_payroll_adjustments_employee_id', table_name='payroll_adjustments')
        op.drop_index('ix_payroll_adjustments_organization_id', table_name='payroll_adjustments')
        op.drop_table('payroll_adjustments')
