"""Add leave template structured fields

Revision ID: c2d3e4f5g6h7
Revises: 7e5075482edb
Create Date: 2026-09-20
"""
from alembic import op
import sqlalchemy as sa

revision = 'c2d3e4f5g6h7'
down_revision = '7e5075482edb'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('leave_templates', sa.Column('accrual_method', sa.String(20), server_default='monthly'))
    op.add_column('leave_templates', sa.Column('accrual_day', sa.Integer(), server_default='1'))
    op.add_column('leave_templates', sa.Column('probation_accrual_rate', sa.Float(), server_default='0.5'))
    op.add_column('leave_templates', sa.Column('max_balance_cap', sa.Integer(), nullable=True))
    op.add_column('leave_templates', sa.Column('lapse_unused', sa.Boolean(), server_default='false'))
    op.add_column('leave_templates', sa.Column('carry_forward_enabled', sa.Boolean(), server_default='false'))
    op.add_column('leave_templates', sa.Column('carry_forward_max_days', sa.Integer(), nullable=True))
    op.add_column('leave_templates', sa.Column('carry_forward_expiry', sa.String(20), server_default='year_end'))
    op.add_column('leave_templates', sa.Column('carry_forward_use_it_or_lose_it', sa.Boolean(), server_default='false'))
    op.add_column('leave_templates', sa.Column('encashment_enabled', sa.Boolean(), server_default='false'))
    op.add_column('leave_templates', sa.Column('encashment_min_balance', sa.Integer(), nullable=True))
    op.add_column('leave_templates', sa.Column('encashment_rate', sa.Float(), nullable=True))
    op.add_column('leave_templates', sa.Column('encashment_taxable', sa.Boolean(), server_default='false'))
    op.add_column('leave_templates', sa.Column('holiday_optional_limit', sa.Integer(), nullable=True))
    op.add_column('leave_templates', sa.Column('holiday_auto_apply_national', sa.Boolean(), server_default='false'))
    op.add_column('leave_templates', sa.Column('enable_half_day', sa.Boolean(), server_default='false'))
    op.add_column('leave_templates', sa.Column('min_leave_for_half_day', sa.Integer(), nullable=True))
    op.add_column('leave_templates', sa.Column('advance_notice_days', sa.Integer(), nullable=True))
    op.add_column('leave_templates', sa.Column('max_consecutive_days', sa.Integer(), nullable=True))


def downgrade():
    for col in ['accrual_method', 'accrual_day', 'probation_accrual_rate', 'max_balance_cap',
                'lapse_unused', 'carry_forward_enabled', 'carry_forward_max_days',
                'carry_forward_expiry', 'carry_forward_use_it_or_lose_it',
                'encashment_enabled', 'encashment_min_balance', 'encashment_rate',
                'encashment_taxable', 'holiday_optional_limit', 'holiday_auto_apply_national',
                'enable_half_day', 'min_leave_for_half_day', 'advance_notice_days',
                'max_consecutive_days']:
        op.drop_column('leave_templates', col)
