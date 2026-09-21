"""merge attendance fields

Revision ID: 7e5075482edb
Revises: b1a2c3d4e5f6, e2a153e99e5d, g7h8i9j0k1l2
Create Date: 2026-09-19 17:07:17.998347

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7e5075482edb'
down_revision: Union[str, Sequence[str], None] = ('b1a2c3d4e5f6', 'e2a153e99e5d', 'g7h8i9j0k1l2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
