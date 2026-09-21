"""attendance policy shared-template marker

Revision ID: 3c8a2b6d9e11
Revises: 2b7f1a5e8c99
Create Date: 2026-09-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c8a2b6d9e11'
down_revision: Union[str, Sequence[str], None] = '2b7f1a5e8c99'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (idempotent)."""
    from sqlalchemy import inspect as _inspect
    cols = {c["name"] for c in _inspect(op.get_bind()).get_columns('attendance_policies')}
    if 'is_shared_template' not in cols:
        op.add_column('attendance_policies', sa.Column('is_shared_template', sa.Boolean(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('attendance_policies', 'is_shared_template')
