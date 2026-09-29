"""Statutory rule configuration table.

Stores current standard values, legal references, and effective dates
for all Indian payroll statutory rules. When the government changes a
rule, update this table once and the entire UI reflects the change.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime

revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'statutory_rule_configs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=True, index=True),
        sa.Column('category', sa.String(50), nullable=False, index=True),  # pf, esi, pt, lwf, nps, gratuity, bonus, general
        sa.Column('rule_key', sa.String(100), nullable=False, index=True),  # e.g. 'pf_wage_ceiling', 'esi_employee_rate'
        sa.Column('label', sa.String(200), nullable=False),  # Display label
        sa.Column('standard_value', sa.String(200), nullable=True),  # e.g. '₹25,000/month', '12%'
        sa.Column('current_value', sa.Float(), nullable=True),  # numeric value for calculations
        sa.Column('unit', sa.String(20), nullable=True),  # %, money, num
        sa.Column('notification_ref', sa.String(500), nullable=True),  # e.g. 'S.O. 5109(E), 17 Sep 2026'
        sa.Column('legal_basis', sa.String(500), nullable=True),  # e.g. 'Section 6(1) EPF Act 1952'
        sa.Column('effective_date', sa.Date(), nullable=True),  # When this rule took effect
        sa.Column('description', sa.Text(), nullable=True),  # Detailed explanation
        sa.Column('status', sa.String(20), nullable=False, default='active'),  # active, superseded, proposed
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_statutory_rule_configs_key', 'statutory_rule_configs', ['rule_key', 'organization_id'], unique=True)


def downgrade():
    op.drop_index('ix_statutory_rule_configs_key')
    op.drop_table('statutory_rule_configs')
