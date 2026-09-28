"""Add eps_employer_rate, nps_employee_rate, nps_employer_rate to statutory_settings.

Revision ID: add_eps_nps_fields_001
Revises: w8x9y0z1a2b3
"""
from alembic import op
import sqlalchemy as sa

revision = 'add_eps_nps_fields_001'
down_revision = 'w8x9y0z1a2b3'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('statutory_settings', sa.Column('eps_employer_rate', sa.Float, nullable=True))
    op.add_column('statutory_settings', sa.Column('nps_employee_rate', sa.Float, nullable=True))
    op.add_column('statutory_settings', sa.Column('nps_employer_rate', sa.Float, nullable=True))

def downgrade():
    op.drop_column('statutory_settings', 'nps_employer_rate')
    op.drop_column('statutory_settings', 'nps_employee_rate')
    op.drop_column('statutory_settings', 'eps_employer_rate')
