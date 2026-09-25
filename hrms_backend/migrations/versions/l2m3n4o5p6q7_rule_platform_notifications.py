"""Add rule platform versioning + government notifications

Revision ID: l2m3n4o5p6q7
Revises: k1l2m3n4o5p6
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'l2m3n4o5p6q7'
down_revision = 'k1l2m3n4o5p6'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    existing_cols = {c['name'] for c in inspector.get_columns('statutory_rules')} \
        if 'statutory_rules' in existing_tables else set()

    if 'government_notifications' not in existing_tables:
        op.create_table(
            'government_notifications',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=True),
            sa.Column('authority', sa.String(200), nullable=False),
            sa.Column('notification_number', sa.String(200), nullable=True),
            sa.Column('title', sa.String(500), nullable=False),
            sa.Column('summary', sa.Text(), nullable=True),
            sa.Column('publication_date', sa.Date(), nullable=True),
            sa.Column('effective_date', sa.Date(), nullable=False),
            sa.Column('source_url', sa.String(500), nullable=True),
            sa.Column('affected_rules', sa.JSON(), nullable=True),
            sa.Column('status', sa.String(20), server_default='draft'),
            sa.Column('reviewed_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('approved_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('published_at', sa.DateTime(), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('deleted_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_government_notifications_organization_id', 'government_notifications', ['organization_id'])
        op.create_index('ix_government_notifications_status', 'government_notifications', ['status'])

    add_cols = [c for c in (
        ('version', sa.Column('version', sa.Integer(), nullable=False, server_default='1')),
        ('created_by', sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True)),
        ('approved_by', sa.Column('approved_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True)),
        ('approved_at', sa.Column('approved_at', sa.DateTime(), nullable=True)),
        ('government_notification_id', sa.Column('government_notification_id', sa.Integer(), sa.ForeignKey('government_notifications.id'), nullable=True)),
    ) if c[0] not in existing_cols]
    if add_cols:
        with op.batch_alter_table('statutory_rules') as batch:
            for _, col in add_cols:
                batch.add_column(col)


def downgrade():
    with op.batch_alter_table('statutory_rules') as batch:
        batch.drop_column('government_notification_id')
        batch.drop_column('approved_at')
        batch.drop_column('approved_by')
        batch.drop_column('created_by')
        batch.drop_column('version')
    op.drop_index('ix_government_notifications_status', table_name='government_notifications')
    op.drop_index('ix_government_notifications_organization_id', table_name='government_notifications')
    op.drop_table('government_notifications')
