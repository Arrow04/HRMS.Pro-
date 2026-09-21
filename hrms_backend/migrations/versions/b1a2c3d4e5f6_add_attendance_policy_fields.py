"""Add attendance policy fields for full configurability

Revision ID: b1a2c3d4e5f6
Revises: ea280fe69be1
Create Date: 2026-09-19
"""
from alembic import op
import sqlalchemy as sa

revision = 'b1a2c3d4e5f6'
down_revision = 'ea280fe69be1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('attendance_policies', sa.Column('check_in_time', sa.String(10), server_default='09:00'))
    op.add_column('attendance_policies', sa.Column('check_out_time', sa.String(10), server_default='18:00'))
    op.add_column('attendance_policies', sa.Column('break_hours', sa.Float(), server_default='1.0'))
    op.add_column('attendance_policies', sa.Column('comp_off_enabled', sa.Boolean(), server_default='false'))
    op.add_column('attendance_policies', sa.Column('max_comp_off_balance', sa.Integer(), server_default='5'))
    op.add_column('attendance_policies', sa.Column('max_overtime_hours_per_month', sa.Float(), nullable=True))
    op.add_column('attendance_policies', sa.Column('selfie_checkin_enabled', sa.Boolean(), server_default='false'))
    op.add_column('attendance_policies', sa.Column('ip_restriction_enabled', sa.Boolean(), server_default='false'))
    op.add_column('attendance_policies', sa.Column('allowed_ip_ranges', sa.JSON(), nullable=True))
    op.add_column('attendance_policies', sa.Column('wifi_checkin_enabled', sa.Boolean(), server_default='false'))
    op.add_column('attendance_policies', sa.Column('allowed_ssids', sa.JSON(), nullable=True))
    op.add_column('attendance_policies', sa.Column('auto_approve_if_no_mark', sa.Boolean(), server_default='false'))
    op.add_column('attendance_policies', sa.Column('min_hours_for_full_day', sa.Float(), server_default='8.0'))
    op.add_column('attendance_policies', sa.Column('shift_based_payroll', sa.Boolean(), server_default='false'))


def downgrade():
    for col in ['check_in_time', 'check_out_time', 'break_hours', 'comp_off_enabled',
                'max_comp_off_balance', 'max_overtime_hours_per_month', 'selfie_checkin_enabled',
                'ip_restriction_enabled', 'allowed_ip_ranges', 'wifi_checkin_enabled',
                'allowed_ssids', 'auto_approve_if_no_mark', 'min_hours_for_full_day',
                'shift_based_payroll']:
        op.drop_column('attendance_policies', col)
