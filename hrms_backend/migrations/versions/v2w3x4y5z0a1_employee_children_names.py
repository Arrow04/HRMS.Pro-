"""Employee children_names field

Revision ID: v2w3x4y5z0a1
Revises: u1v2w3x4y5z0
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'v2w3x4y5z0a1'
down_revision = 'u1v2w3x4y5z0'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c['name'] for c in inspector.get_columns('employees')}
    if 'children_names' not in cols:
        op.add_column('employees', sa.Column('children_names', sa.String(length=500), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c['name'] for c in inspector.get_columns('employees')}
    if 'children_names' in cols:
        op.drop_column('employees', 'children_names')
