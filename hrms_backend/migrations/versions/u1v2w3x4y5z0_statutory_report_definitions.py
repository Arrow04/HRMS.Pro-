"""Statutory report definitions (mandate section 51)

Revision ID: u1v2w3x4y5z0
Revises: t0u1v2w3x4y5
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'u1v2w3x4y5z0'
down_revision = 't0u1v2w3x4y5'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'statutory_report_definitions' in set(inspector.get_table_names()):
        return
    op.create_table(
        'statutory_report_definitions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=True),
        sa.Column('code', sa.String(50), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('country', sa.String(50), server_default='India'),
        sa.Column('state_code', sa.String(10), nullable=True),
        sa.Column('authority', sa.String(200), nullable=True),
        sa.Column('fields', sa.JSON(), nullable=False),
        sa.Column('filters', sa.JSON(), nullable=True),
        sa.Column('period_type', sa.String(20), server_default='monthly'),
        sa.Column('file_format', sa.String(20), server_default='csv'),
        sa.Column('validation', sa.JSON(), nullable=True),
        sa.Column('effective_from', sa.Date(), nullable=False),
        sa.Column('effective_to', sa.Date(), nullable=True),
        sa.Column('status', sa.String(20), server_default='active'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index('ix_statutory_report_definitions_organization_id', 'statutory_report_definitions', ['organization_id'])
    op.create_index('ix_statutory_report_definitions_code', 'statutory_report_definitions', ['code'])
    op.create_index('ix_statutory_report_definitions_status', 'statutory_report_definitions', ['status'])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'statutory_report_definitions' in set(inspector.get_table_names()):
        op.drop_index('ix_statutory_report_definitions_status', table_name='statutory_report_definitions')
        op.drop_index('ix_statutory_report_definitions_code', table_name='statutory_report_definitions')
        op.drop_index('ix_statutory_report_definitions_organization_id', table_name='statutory_report_definitions')
        op.drop_table('statutory_report_definitions')
