"""Split bonus ceiling into eligibility (21000) and calculation cap (7000).

Revision ID: c3d4e5f6a7b8
Revises: add_eps_nps_fields_001
"""
from alembic import op
import sqlalchemy as sa

revision = 'c3d4e5f6a7b8'
down_revision = 'add_eps_nps_fields_001'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('statutory_settings', sa.Column('bonus_eligible_ceiling', sa.Float, nullable=True))
    # Existing rows carry the old single ceiling (default 21000): keep it as
    # the eligibility cutoff, move the calculation cap to the statutory 7000.
    op.execute("UPDATE statutory_settings SET bonus_eligible_ceiling = COALESCE(bonus_wage_ceiling, 21000.0)")
    op.execute("UPDATE statutory_settings SET bonus_wage_ceiling = 7000.0 WHERE bonus_wage_ceiling = 21000.0")

def downgrade():
    op.drop_column('statutory_settings', 'bonus_eligible_ceiling')
