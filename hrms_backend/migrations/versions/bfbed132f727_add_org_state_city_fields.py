"""add_org_state_city_fields

Revision ID: bfbed132f727
Revises: 61ccabab0369
Create Date: 2026-07-25 00:16:14.390286

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'bfbed132f727'
down_revision: Union[str, Sequence[str], None] = '61ccabab0369'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    org_cols = [c['name'] for c in inspector.get_columns('organizations')]

    with op.batch_alter_table('organizations', schema=None) as batch_op:
        if 'registered_state' not in org_cols:
            batch_op.add_column(sa.Column('registered_state', sa.String(100), nullable=True))
        if 'registered_city' not in org_cols:
            batch_op.add_column(sa.Column('registered_city', sa.String(100), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('organizations', schema=None) as batch_op:
        batch_op.drop_column('registered_city')
        batch_op.drop_column('registered_state')
