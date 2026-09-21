"""attendance policy status conversion rules

Revision ID: 1a6e9c4d7b88
Revises: 9c5d2e4f3a66
Create Date: 2026-09-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1a6e9c4d7b88'
down_revision: Union[str, Sequence[str], None] = '9c5d2e4f3a66'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (idempotent)."""
    from sqlalchemy import inspect as _inspect
    cols = {c["name"] for c in _inspect(op.get_bind()).get_columns('attendance_policies')}
    if 'late_to_absent_count' not in cols:
        op.add_column('attendance_policies', sa.Column('late_to_absent_count', sa.Integer(), nullable=True))
    if 'early_to_absent_count' not in cols:
        op.add_column('attendance_policies', sa.Column('early_to_absent_count', sa.Integer(), nullable=True))
    if 'missing_checkout_rule' not in cols:
        op.add_column('attendance_policies', sa.Column('missing_checkout_rule', sa.String(length=20), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('attendance_policies', 'missing_checkout_rule')
    op.drop_column('attendance_policies', 'early_to_absent_count')
    op.drop_column('attendance_policies', 'late_to_absent_count')
