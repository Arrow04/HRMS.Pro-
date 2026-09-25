"""Payroll approval workflow table (mandate section 47)

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'r8s9t0u1v2w3'
down_revision = 'q7r8s9t0u1v2'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'payroll_approvals' in set(inspector.get_table_names()):
        return
    op.create_table(
        'payroll_approvals',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('payroll_id', sa.Integer(), sa.ForeignKey('payrolls.id'), nullable=False),
        sa.Column('step_order', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('step_name', sa.String(100), nullable=False),
        sa.Column('role', sa.String(50), nullable=False),
        sa.Column('approver_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('decision', sa.String(20), server_default='pending'),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_payroll_approvals_organization_id', 'payroll_approvals', ['organization_id'])
    op.create_index('ix_payroll_approvals_payroll_id', 'payroll_approvals', ['payroll_id'])
    op.create_index('ix_payroll_approvals_decision', 'payroll_approvals', ['decision'])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'payroll_approvals' in set(inspector.get_table_names()):
        op.drop_index('ix_payroll_approvals_decision', table_name='payroll_approvals')
        op.drop_index('ix_payroll_approvals_payroll_id', table_name='payroll_approvals')
        op.drop_index('ix_payroll_approvals_organization_id', table_name='payroll_approvals')
        op.drop_table('payroll_approvals')
