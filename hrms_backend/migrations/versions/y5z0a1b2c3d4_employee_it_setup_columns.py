"""Employee IT setup columns (dates, text, checklist booleans)

Revision ID: y5z0a1b2c3d4
Revises: x4y5z0a1b2c3
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'y5z0a1b2c3d4'
down_revision = 'x4y5z0a1b2c3'
branch_labels = None
depends_on = None

IT_COLUMNS = [
    sa.Column('it_assigned_by', sa.String(150), nullable=True),
    sa.Column('it_assigned_date', sa.Date, nullable=True),
    sa.Column('it_grant_date', sa.Date, nullable=True),
    sa.Column('it_completion_date', sa.Date, nullable=True),
    sa.Column('it_notes', sa.Text, nullable=True),
    sa.Column('it_email_created', sa.Boolean(), nullable=True),
    sa.Column('it_system_access', sa.Boolean(), nullable=True),
    sa.Column('it_erp_access', sa.Boolean(), nullable=True),
    sa.Column('it_cloud_apps', sa.Boolean(), nullable=True),
    sa.Column('it_shared_drives', sa.Boolean(), nullable=True),
    sa.Column('it_hrms_account', sa.Boolean(), nullable=True),
    sa.Column('it_group_memberships', sa.Boolean(), nullable=True),
    sa.Column('it_credentials_issued', sa.Boolean(), nullable=True),
    sa.Column('it_vpn_access', sa.Boolean(), nullable=True),
    sa.Column('it_mfa_enabled', sa.Boolean(), nullable=True),
    sa.Column('it_password_manager', sa.Boolean(), nullable=True),
    sa.Column('it_role_assigned', sa.Boolean(), nullable=True),
    sa.Column('it_endpoint_protection', sa.Boolean(), nullable=True),
    sa.Column('it_hardware_assigned', sa.Boolean(), nullable=True),
    sa.Column('it_policy_signed', sa.Boolean(), nullable=True),
    sa.Column('it_training_done', sa.Boolean(), nullable=True),
    sa.Column('it_asset_tag', sa.Boolean(), nullable=True),
    sa.Column('it_laptop_encryption', sa.Boolean(), nullable=True),
    sa.Column('it_work_phone', sa.Boolean(), nullable=True),
]


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c['name'] for c in inspector.get_columns('employees')}
    for col in IT_COLUMNS:
        if col.name not in cols:
            op.add_column('employees', col)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c['name'] for c in inspector.get_columns('employees')}
    for col in reversed(IT_COLUMNS):
        if col.name in cols:
            op.drop_column('employees', col.name)
