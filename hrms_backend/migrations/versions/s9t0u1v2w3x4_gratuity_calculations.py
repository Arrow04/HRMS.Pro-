"""Gratuity calculation records (mandate section 23)

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 's9t0u1v2w3x4'
down_revision = 'r8s9t0u1v2w3'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'gratuity_calculations' in set(inspector.get_table_names()):
        return
    op.create_table(
        'gratuity_calculations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('service_years', sa.Float(), server_default='0'),
        sa.Column('wage_basis', sa.String(50), nullable=True),
        sa.Column('wage_basis_value', sa.Float(), server_default='0'),
        sa.Column('days_per_year', sa.Float(), server_default='15'),
        sa.Column('divisor', sa.Float(), server_default='26'),
        sa.Column('amount', sa.Float(), server_default='0'),
        sa.Column('eligible', sa.Boolean(), server_default=sa.false()),
        sa.Column('capped', sa.Boolean(), server_default=sa.false()),
        sa.Column('status', sa.String(20), server_default='accrued'),
        sa.Column('settlement_ref', sa.String(100), nullable=True),
        sa.Column('calculated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_gratuity_calculations_organization_id', 'gratuity_calculations', ['organization_id'])
    op.create_index('ix_gratuity_calculations_employee_id', 'gratuity_calculations', ['employee_id'])
    op.create_index('ix_gratuity_calculations_status', 'gratuity_calculations', ['status'])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'gratuity_calculations' in set(inspector.get_table_names()):
        op.drop_index('ix_gratuity_calculations_status', table_name='gratuity_calculations')
        op.drop_index('ix_gratuity_calculations_employee_id', table_name='gratuity_calculations')
        op.drop_index('ix_gratuity_calculations_organization_id', table_name='gratuity_calculations')
        op.drop_table('gratuity_calculations')
