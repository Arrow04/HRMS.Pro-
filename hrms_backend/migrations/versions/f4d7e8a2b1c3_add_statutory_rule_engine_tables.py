"""Add statutory_rules and employee_voluntary_pf tables for rule engine

Revision ID: f4d7e8a2b1c3
Revises: ea280fe69be1
Create Date: 2026-09-17 08:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f4d7e8a2b1c3'
down_revision: Union[str, Sequence[str], None] = 'ea280fe69be1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── statutory_rules ──
    op.create_table(
        'statutory_rules',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=True),
        sa.Column('rule_type', sa.String(50), nullable=False),
        sa.Column('rule_subtype', sa.String(50), nullable=True),
        sa.Column('country', sa.String(50), nullable=False, server_default='India'),
        sa.Column('state_code', sa.String(10), nullable=True),
        sa.Column('effective_from', sa.Date(), nullable=False),
        sa.Column('effective_to', sa.Date(), nullable=True),
        sa.Column('definition', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('notification_number', sa.String(200), nullable=True),
        sa.Column('notification_date', sa.Date(), nullable=True),
        sa.Column('gazette_url', sa.String(500), nullable=True),
        sa.Column('status', sa.String(20), server_default='active'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('idx_sr_type_country_state', 'statutory_rules', ['rule_type', 'country', 'state_code'])
    op.create_index('idx_sr_org_effective', 'statutory_rules', ['organization_id', 'effective_from'])
    op.create_index('idx_sr_type_org_dates', 'statutory_rules', ['rule_type', 'organization_id', 'effective_from', 'effective_to'])
    op.create_index('ix_statutory_rules_rule_type', 'statutory_rules', ['rule_type'])
    op.create_index('ix_statutory_rules_organization_id', 'statutory_rules', ['organization_id'])
    op.create_index('ix_statutory_rules_status', 'statutory_rules', ['status'])
    op.create_index('ix_statutory_rules_deleted_at', 'statutory_rules', ['deleted_at'])

    # ── employee_voluntary_pf ──
    op.create_table(
        'employee_voluntary_pf',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('voluntary_rate', sa.Float(), nullable=True),
        sa.Column('voluntary_amount', sa.Float(), nullable=True),
        sa.Column('employer_matching', sa.Boolean(), server_default='false'),
        sa.Column('employer_voluntary_rate', sa.Float(), nullable=True),
        sa.Column('effective_from', sa.Date(), nullable=False),
        sa.Column('effective_to', sa.Date(), nullable=True),
        sa.Column('status', sa.String(20), server_default='active'),
        sa.Column('stopped_by_employee', sa.Boolean(), server_default='false'),
        sa.Column('stopped_by_employer', sa.Boolean(), server_default='false'),
        sa.Column('stopped_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_employee_voluntary_pf_employee_id', 'employee_voluntary_pf', ['employee_id'])
    op.create_index('ix_employee_voluntary_pf_organization_id', 'employee_voluntary_pf', ['organization_id'])
    op.create_index('ix_employee_voluntary_pf_status', 'employee_voluntary_pf', ['status'])
    op.create_index('ix_employee_voluntary_pf_deleted_at', 'employee_voluntary_pf', ['deleted_at'])


def downgrade() -> None:
    op.drop_table('employee_voluntary_pf')
    op.drop_table('statutory_rules')
