"""add_reporting_manager_to_employees

Revision ID: add_reporting_manager_to_employees
Revises: attendance_correction_requests
Create Date: 2026-09-09

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers
revision = 'add_reporting_manager_to_employees'
down_revision = 'attendance_correction_requests'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('employees', sa.Column('reporting_manager_id', sa.Integer(), nullable=True))
    op.create_index('ix_employees_reporting_manager_id', 'employees', ['reporting_manager_id'])
    op.create_foreign_key('fk_employees_reporting_manager_id', 'employees', 'employees', ['reporting_manager_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_employees_reporting_manager_id', 'employees', type_='foreignkey')
    op.drop_index('ix_employees_reporting_manager_id', table_name='employees')
    op.drop_column('employees', 'reporting_manager_id')
