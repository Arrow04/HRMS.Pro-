"""attendance policy default shift link

Revision ID: 9c5d2e4f3a66
Revises: 8a4b1d3f2c55
Create Date: 2026-09-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9c5d2e4f3a66'
down_revision: Union[str, Sequence[str], None] = '8a4b1d3f2c55'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (idempotent)."""
    from sqlalchemy import inspect as _inspect
    cols = {c["name"] for c in _inspect(op.get_bind()).get_columns('attendance_policies')}
    if 'shift_id' not in cols:
        op.add_column('attendance_policies', sa.Column('shift_id', sa.Integer(), nullable=True))
        op.create_index('ix_attendance_policies_shift_id', 'attendance_policies', ['shift_id'], unique=False)
        op.create_foreign_key('fk_attendance_policies_shift_id', 'attendance_policies', 'shifts', ['shift_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_attendance_policies_shift_id', 'attendance_policies', type_='foreignkey')
    op.drop_index('ix_attendance_policies_shift_id', table_name='attendance_policies')
    op.drop_column('attendance_policies', 'shift_id')
