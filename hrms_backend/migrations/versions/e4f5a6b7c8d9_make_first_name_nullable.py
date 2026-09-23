"""Make employee first_name nullable

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-09-21
"""
from alembic import op
import sqlalchemy as sa

revision = 'e4f5a6b7c8d9'
down_revision = 'd3e4f5a6b7c8'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column('employees', 'first_name', nullable=True)


def downgrade():
    op.alter_column('employees', 'first_name', nullable=False)
