"""Bank payment batches + transactions (mandate section 49)

Revision ID: t0u1v2w3x4y5
Revises: s9t0u1v2w3x4
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = 't0u1v2w3x4y5'
down_revision = 's9t0u1v2w3x4'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if 'payment_batches' not in tables:
        op.create_table(
            'payment_batches',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('organization_id', sa.Integer(), sa.ForeignKey('organizations.id'), nullable=False),
            sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id'), nullable=True),
            sa.Column('batch_ref', sa.String(50), nullable=False),
            sa.Column('month', sa.Integer(), nullable=False),
            sa.Column('year', sa.Integer(), nullable=False),
            sa.Column('payment_mode', sa.String(30), server_default='bank_transfer'),
            sa.Column('status', sa.String(20), server_default='draft'),
            sa.Column('file_name', sa.String(200), nullable=True),
            sa.Column('file_format', sa.String(20), server_default='csv'),
            sa.Column('total_amount', sa.Float(), server_default='0'),
            sa.Column('employee_count', sa.Integer(), server_default='0'),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('generated_at', sa.DateTime(), nullable=True),
            sa.Column('paid_at', sa.DateTime(), nullable=True),
            sa.Column('reconciled_at', sa.DateTime(), nullable=True),
        )
        op.create_index('ix_payment_batches_organization_id', 'payment_batches', ['organization_id'])
        op.create_index('ix_payment_batches_batch_ref', 'payment_batches', ['batch_ref'])
        op.create_index('ix_payment_batches_status', 'payment_batches', ['status'])
    if 'payment_transactions' not in tables:
        op.create_table(
            'payment_transactions',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('batch_id', sa.Integer(), sa.ForeignKey('payment_batches.id'), nullable=False),
            sa.Column('payroll_id', sa.Integer(), sa.ForeignKey('payrolls.id'), nullable=True),
            sa.Column('employee_id', sa.Integer(), sa.ForeignKey('employees.id'), nullable=False),
            sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
            sa.Column('bank_account', sa.String(100), nullable=True),
            sa.Column('ifsc_code', sa.String(50), nullable=True),
            sa.Column('status', sa.String(20), server_default='pending'),
            sa.Column('failure_reason', sa.String(255), nullable=True),
            sa.Column('reference_no', sa.String(100), nullable=True),
            sa.Column('paid_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index('ix_payment_transactions_batch_id', 'payment_transactions', ['batch_id'])
        op.create_index('ix_payment_transactions_employee_id', 'payment_transactions', ['employee_id'])
        op.create_index('ix_payment_transactions_status', 'payment_transactions', ['status'])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if 'payment_transactions' in tables:
        op.drop_index('ix_payment_transactions_status', table_name='payment_transactions')
        op.drop_index('ix_payment_transactions_employee_id', table_name='payment_transactions')
        op.drop_index('ix_payment_transactions_batch_id', table_name='payment_transactions')
        op.drop_table('payment_transactions')
    if 'payment_batches' in tables:
        op.drop_index('ix_payment_batches_status', table_name='payment_batches')
        op.drop_index('ix_payment_batches_batch_ref', table_name='payment_batches')
        op.drop_index('ix_payment_batches_organization_id', table_name='payment_batches')
        op.drop_table('payment_batches')
