"""add_anomaly_alerts

Revision ID: baf515839420
Revises: bfbed132f727
Create Date: 2026-07-25 01:06:26.640873

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'baf515839420'
down_revision: Union[str, Sequence[str], None] = 'bfbed132f727'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('anomaly_alerts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('organization_id', sa.Integer(), nullable=False),
        sa.Column('anomaly_type', sa.String(length=50), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('employee_ids', sa.JSON(), nullable=True),
        sa.Column('related_entity_type', sa.String(length=50), nullable=True),
        sa.Column('related_entity_id', sa.Integer(), nullable=True),
        sa.Column('evidence_data', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('dismissed_by', sa.Integer(), nullable=True),
        sa.Column('dismissed_at', sa.DateTime(), nullable=True),
        sa.Column('dismissed_reason', sa.String(length=255), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['dismissed_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_anomaly_alerts_anomaly_type', 'anomaly_alerts', ['anomaly_type'])
    op.create_index('ix_anomaly_alerts_created_at', 'anomaly_alerts', ['created_at'])
    op.create_index('ix_anomaly_alerts_organization_id', 'anomaly_alerts', ['organization_id'])
    op.create_index('ix_anomaly_alerts_status', 'anomaly_alerts', ['status'])


def downgrade() -> None:
    op.drop_index('ix_anomaly_alerts_status', table_name='anomaly_alerts')
    op.drop_index('ix_anomaly_alerts_organization_id', table_name='anomaly_alerts')
    op.drop_index('ix_anomaly_alerts_created_at', table_name='anomaly_alerts')
    op.drop_index('ix_anomaly_alerts_anomaly_type', table_name='anomaly_alerts')
    op.drop_table('anomaly_alerts')
