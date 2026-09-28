"""Scope state compliance (PT slabs / LWF configs) to org + company

Revision ID: w8x9y0z1a2b3
Revises: z5a1b2c3d4e5
Create Date: 2026-09-27
"""
from alembic import op
import sqlalchemy as sa

revision = 'w8x9y0z1a2b3'
down_revision = 'z5a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade():
    for table in ('state_pt_slabs', 'state_lwf_configs'):
        op.add_column(table, sa.Column('organization_id', sa.Integer(), nullable=True))
        op.add_column(table, sa.Column('company_id', sa.Integer(), nullable=True))
        op.create_foreign_key(f'fk_{table}_organization', table, 'organizations', ['organization_id'], ['id'])
        op.create_foreign_key(f'fk_{table}_company', table, 'companies', ['company_id'], ['id'])
        op.create_index(f'ix_{table}_organization_id', table, ['organization_id'])
        op.create_index(f'ix_{table}_company_id', table, ['company_id'])
        op.create_index(
            f'ix_{table}_state_org_company',
            table,
            ['state_code', 'organization_id', 'company_id'],
        )


def downgrade():
    for table in ('state_pt_slabs', 'state_lwf_configs'):
        op.drop_index(f'ix_{table}_state_org_company', table_name=table)
        op.drop_index(f'ix_{table}_company_id', table_name=table)
        op.drop_index(f'ix_{table}_organization_id', table_name=table)
        op.drop_constraint(f'fk_{table}_company', table, type_='foreignkey')
        op.drop_constraint(f'fk_{table}_organization', table, type_='foreignkey')
        op.drop_column(table, 'company_id')
        op.drop_column(table, 'organization_id')
