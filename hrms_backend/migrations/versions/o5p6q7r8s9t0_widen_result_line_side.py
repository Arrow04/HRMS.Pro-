"""Widen payroll_result_lines.side (employer_contribution needs 21+ chars)

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'o5p6q7r8s9t0'
down_revision = 'n4o5p6q7r8s9'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if 'payroll_result_lines' not in set(inspector.get_table_names()):
        return
    cols = {c['name']: c for c in inspector.get_columns('payroll_result_lines')}
    col = cols.get('side')
    if col is not None and getattr(col.get('type'), 'length', None) in (None, 20):
        with op.batch_alter_table('payroll_result_lines') as batch:
            batch.alter_column('side', type_=sa.String(30), existing_nullable=False)


def downgrade():
    pass
