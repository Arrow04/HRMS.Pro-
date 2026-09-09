"""attendance_correction_requests

Revision ID: attendance_correction_requests
Revises: performance_indexes
Create Date: 2026-09-09

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers
revision = 'attendance_correction_requests'
down_revision = 'performance_indexes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'attendance_correction_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('attendance_id', sa.Integer(), nullable=True),
        sa.Column('organization_id', sa.Integer(), nullable=True),
        sa.Column('company_id', sa.Integer(), nullable=True),
        sa.Column('branch_id', sa.Integer(), nullable=True),
        sa.Column('department_id', sa.Integer(), nullable=True),
        sa.Column('request_date', sa.DateTime(), nullable=False),
        sa.Column('requested_check_in', sa.DateTime(), nullable=True),
        sa.Column('requested_check_out', sa.DateTime(), nullable=True),
        sa.Column('requested_status', sa.String(length=50), nullable=True),
        sa.Column('requested_work_hours', sa.Float(), nullable=True),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default=text("'pending'")),
        sa.Column('reviewed_by', sa.Integer(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('review_comments', sa.Text(), nullable=True),
        sa.Column('created_attendance_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['attendance_id'], ['attendances.id'], ),
        sa.ForeignKeyConstraint(['branch_id'], ['branches.id'], ),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.ForeignKeyConstraint(['created_attendance_id'], ['attendances.id'], ),
        sa.ForeignKeyConstraint(['department_id'], ['departments.id'], ),
        sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_attendance_correction_requests_created_at', 'attendance_correction_requests', ['created_at'])
    op.create_index('ix_attendance_correction_requests_deleted_at', 'attendance_correction_requests', ['deleted_at'])
    op.create_index('ix_attendance_correction_requests_employee_id', 'attendance_correction_requests', ['employee_id'])
    op.create_index('ix_attendance_correction_requests_status', 'attendance_correction_requests', ['status'])


def downgrade() -> None:
    op.drop_index('ix_attendance_correction_requests_status', table_name='attendance_correction_requests')
    op.drop_index('ix_attendance_correction_requests_employee_id', table_name='attendance_correction_requests')
    op.drop_index('ix_attendance_correction_requests_deleted_at', table_name='attendance_correction_requests')
    op.drop_index('ix_attendance_correction_requests_created_at', table_name='attendance_correction_requests')
    op.drop_table('attendance_correction_requests')
