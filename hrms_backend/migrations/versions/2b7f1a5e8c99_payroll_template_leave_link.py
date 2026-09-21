"""payroll template leave template link

Revision ID: 2b7f1a5e8c99
Revises: 1a6e9c4d7b88
Create Date: 2026-09-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b7f1a5e8c99'
down_revision: Union[str, Sequence[str], None] = '1a6e9c4d7b88'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema (idempotent)."""
    from sqlalchemy import inspect as _inspect
    cols = {c["name"] for c in _inspect(op.get_bind()).get_columns('payroll_templates')}
    if 'leave_template_id' not in cols:
        op.add_column('payroll_templates', sa.Column('leave_template_id', sa.Integer(), nullable=True))
        op.create_index('ix_payroll_templates_leave_template_id', 'payroll_templates', ['leave_template_id'], unique=False)
        op.create_foreign_key('fk_payroll_templates_leave_template_id', 'payroll_templates', 'leave_templates', ['leave_template_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_payroll_templates_leave_template_id', 'payroll_templates', type_='foreignkey')
    op.drop_index('ix_payroll_templates_leave_template_id', table_name='payroll_templates')
    op.drop_column('payroll_templates', 'leave_template_id')
