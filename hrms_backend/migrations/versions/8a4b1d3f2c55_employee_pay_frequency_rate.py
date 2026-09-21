"""employee pay frequency + rate (daily / weekly support)

Revision ID: 8a4b1d3f2c55
Revises: 7f3a9c2e1b44
Create Date: 2026-09-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8a4b1d3f2c55'
down_revision: Union[str, Sequence[str], None] = '7f3a9c2e1b44'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (idempotent)."""
    from sqlalchemy import inspect as _inspect
    cols = {c["name"] for c in _inspect(op.get_bind()).get_columns('employees')}
    if 'pay_frequency' not in cols:
        op.add_column('employees', sa.Column('pay_frequency', sa.String(length=20), nullable=True))
    if 'pay_rate' not in cols:
        op.add_column('employees', sa.Column('pay_rate', sa.Float(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('employees', 'pay_rate')
    op.drop_column('employees', 'pay_frequency')
