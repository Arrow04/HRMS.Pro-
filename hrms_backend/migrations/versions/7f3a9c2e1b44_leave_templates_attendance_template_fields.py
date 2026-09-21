"""leave templates + attendance template fields + employee leave_template_id

Revision ID: 7f3a9c2e1b44
Revises: a1b2c3d4e5f6
Create Date: 2026-09-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f3a9c2e1b44'
down_revision: Union[str, Sequence[str], None] = 'c9d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_columns(table: str):
    from sqlalchemy import inspect as _inspect
    return {c["name"] for c in _inspect(op.get_bind()).get_columns(table)}


def _table_indexes(table: str):
    from sqlalchemy import inspect as _inspect
    return {i["name"] for i in _inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    """Upgrade schema (idempotent — safe if create_all already made the table)."""
    from sqlalchemy import inspect as _inspect
    have_tables = set(_inspect(op.get_bind()).get_table_names())
    if "leave_templates" not in have_tables:
        op.create_table(
            'leave_templates',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('organization_id', sa.Integer(), nullable=False),
            sa.Column('company_id', sa.Integer(), nullable=True),
            sa.Column('name', sa.String(length=200), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('status', sa.String(length=20), nullable=True),
            sa.Column('body', sa.JSON(), nullable=True),
            sa.Column('version', sa.Integer(), nullable=True),
            sa.Column('effective_from', sa.Date(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('deleted_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
            sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
            sa.PrimaryKeyConstraint('id'),
        )
    for idx, cols in (
        ('ix_leave_templates_company_id', ['company_id']),
        ('ix_leave_templates_deleted_at', ['deleted_at']),
        ('ix_leave_templates_organization_id', ['organization_id']),
        ('ix_leave_templates_status', ['status']),
    ):
        if idx not in _table_indexes("leave_templates"):
            op.create_index(idx, 'leave_templates', cols, unique=False)

    if 'leave_template_id' not in _table_columns('employees'):
        op.add_column('employees', sa.Column('leave_template_id', sa.Integer(), nullable=True))
    if 'ix_employees_leave_template_id' not in _table_indexes('employees'):
        op.create_index('ix_employees_leave_template_id', 'employees', ['leave_template_id'], unique=False)
        op.create_foreign_key('fk_employees_leave_template_id', 'employees', 'leave_templates', ['leave_template_id'], ['id'])

    att_cols = _table_columns('attendance_policies')
    if 'description' not in att_cols:
        op.add_column('attendance_policies', sa.Column('description', sa.Text(), nullable=True))
    if 'wfh_allowed' not in att_cols:
        op.add_column('attendance_policies', sa.Column('wfh_allowed', sa.Boolean(), nullable=True))
    if 'geofence_enabled' not in att_cols:
        op.add_column('attendance_policies', sa.Column('geofence_enabled', sa.Boolean(), nullable=True))
    if 'geofence_radius' not in att_cols:
        op.add_column('attendance_policies', sa.Column('geofence_radius', sa.Float(), nullable=True))
    if 'version' not in att_cols:
        op.add_column('attendance_policies', sa.Column('version', sa.Integer(), nullable=True))
    if 'effective_from' not in att_cols:
        op.add_column('attendance_policies', sa.Column('effective_from', sa.Date(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('attendance_policies', 'effective_from')
    op.drop_column('attendance_policies', 'version')
    op.drop_column('attendance_policies', 'geofence_radius')
    op.drop_column('attendance_policies', 'geofence_enabled')
    op.drop_column('attendance_policies', 'wfh_allowed')
    op.drop_column('attendance_policies', 'description')
    op.drop_constraint('fk_employees_leave_template_id', 'employees', type_='foreignkey')
    op.drop_index('ix_employees_leave_template_id', table_name='employees')
    op.drop_column('employees', 'leave_template_id')
    op.drop_index('ix_leave_templates_status', table_name='leave_templates')
    op.drop_index('ix_leave_templates_organization_id', table_name='leave_templates')
    op.drop_index('ix_leave_templates_deleted_at', table_name='leave_templates')
    op.drop_index('ix_leave_templates_company_id', table_name='leave_templates')
    op.drop_table('leave_templates')
