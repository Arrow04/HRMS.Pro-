"""Add HRA auto-calc fields to InvestmentDeclaration

Revision ID: ea280fe69be1
Revises: 3c8a2b6d9e11
Create Date: 2026-09-17 02:49:17.315853

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'ea280fe69be1'
down_revision: Union[str, Sequence[str], None] = '3c8a2b6d9e11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('investment_declarations', sa.Column('hra_monthly_rent', sa.Float(), nullable=True))
    op.add_column('investment_declarations', sa.Column('hra_is_metro', sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column('investment_declarations', 'hra_is_metro')
    op.drop_column('investment_declarations', 'hra_monthly_rent')
