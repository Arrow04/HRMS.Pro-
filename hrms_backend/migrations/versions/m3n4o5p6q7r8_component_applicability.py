"""Component applicability matrix (mandate section 37)

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'm3n4o5p6q7r8'
down_revision = 'l2m3n4o5p6q7'
branch_labels = None
depends_on = None

_NEW_COLS = [
    # taxable | partially_taxable | non_taxable | conditional
    ('taxability', sa.Column('taxability', sa.String(20), nullable=True)),
    ('pf_applicable', sa.Column('pf_applicable', sa.Boolean(), server_default=sa.true())),
    ('esi_applicable', sa.Column('esi_applicable', sa.Boolean(), server_default=sa.true())),
    ('pt_applicable', sa.Column('pt_applicable', sa.Boolean(), server_default=sa.true())),
    ('lwf_applicable', sa.Column('lwf_applicable', sa.Boolean(), server_default=sa.true())),
    ('gratuity_applicable', sa.Column('gratuity_applicable', sa.Boolean(), server_default=sa.false())),
    ('bonus_applicable', sa.Column('bonus_applicable', sa.Boolean(), server_default=sa.true())),
    ('nps_applicable', sa.Column('nps_applicable', sa.Boolean(), server_default=sa.false())),
]


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c['name'] for c in inspector.get_columns('payroll_components')}
    add_cols = [col for name, col in _NEW_COLS if name not in existing]
    if add_cols:
        with op.batch_alter_table('payroll_components') as batch:
            for col in add_cols:
                batch.add_column(col)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c['name'] for c in inspector.get_columns('payroll_components')}
    drop_cols = [col for name, col in _NEW_COLS if name in existing]
    if drop_cols:
        with op.batch_alter_table('payroll_components') as batch:
            for col in drop_cols:
                batch.drop_column(col.name)
