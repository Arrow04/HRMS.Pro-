"""Payroll explainability lines (mandate section 43)

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'n4o5p6q7r8s9'
down_revision = 'm3n4o5p6q7r8'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'payroll_result_lines' in set(inspector.get_table_names()):
        return
    op.create_table(
        'payroll_result_lines',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('payroll_id', sa.Integer(), sa.ForeignKey('payrolls.id'), nullable=False),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('component_code', sa.String(50), nullable=False),
        sa.Column('label', sa.String(200), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('side', sa.String(20), nullable=False),
        sa.Column('sequence', sa.Integer(), server_default='0'),
        sa.Column('source', sa.String(30), server_default='rule'),
        sa.Column('rule_id', sa.Integer(), sa.ForeignKey('statutory_rules.id'), nullable=True),
        sa.Column('rule_version', sa.Integer(), nullable=True),
        sa.Column('rule_type', sa.String(50), nullable=True),
        sa.Column('formula', sa.Text(), nullable=True),
        sa.Column('inputs', sa.JSON(), nullable=True),
        sa.Column('wage_basis', sa.String(50), nullable=True),
        sa.Column('effective_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_payroll_result_lines_payroll_id', 'payroll_result_lines', ['payroll_id'])
    op.create_index('ix_payroll_result_lines_organization_id', 'payroll_result_lines', ['organization_id'])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'payroll_result_lines' in set(inspector.get_table_names()):
        op.drop_index('ix_payroll_result_lines_organization_id', table_name='payroll_result_lines')
        op.drop_index('ix_payroll_result_lines_payroll_id', table_name='payroll_result_lines')
        op.drop_table('payroll_result_lines')
