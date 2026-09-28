"""Employee gratuity_applicable field

Revision ID: x4y5z0a1b2c3
Revises: v2w3x4y5z0a1
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'x4y5z0a1b2c3'
down_revision = 'v2w3x4y5z0a1'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c['name'] for c in inspector.get_columns('employees')}
    if 'gratuity_applicable' not in cols:
        op.add_column('employees', sa.Column('gratuity_applicable', sa.Boolean(), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c['name'] for c in inspector.get_columns('employees')}
    if 'gratuity_applicable' in cols:
        op.drop_column('employees', 'gratuity_applicable')
