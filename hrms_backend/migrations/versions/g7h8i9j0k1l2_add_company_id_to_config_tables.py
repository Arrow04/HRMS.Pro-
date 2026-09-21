"""Add company_id to config tables for per-company isolation

Revision ID: g7h8i9j0k1l2
Revises: f4d7e8a2b1c3
Create Date: 2026-09-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'g7h8i9j0k1l2'
down_revision = 'f4d7e8a2b1c3'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    # PayrollPolicy — add company_id
    op.add_column('payroll_policies', sa.Column('company_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_payroll_policies_company', 'payroll_policies', 'companies', ['company_id'], ['id'])
    op.create_index('ix_payroll_policies_company_id', 'payroll_policies', ['company_id'])

    # PayrollComponent — add company_id
    op.add_column('payroll_components', sa.Column('company_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_payroll_components_company', 'payroll_components', 'companies', ['company_id'], ['id'])
    op.create_index('ix_payroll_components_company_id', 'payroll_components', ['company_id'])

    # TaxRegime — add company_id
    op.add_column('tax_regimes', sa.Column('company_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_tax_regimes_company', 'tax_regimes', 'companies', ['company_id'], ['id'])
    op.create_index('ix_tax_regimes_company_id', 'tax_regimes', ['company_id'])

    # StatutorySetting — drop unique on org_id if exists, add company_id
    # Find and drop any unique constraint on organization_id
    insp = sa.inspect(bind)
    for cons in insp.get_unique_constraints('statutory_settings'):
        if cons.get('column_names') == ['organization_id']:
            op.drop_constraint(cons['name'], 'statutory_settings', type_='unique')
            break
    op.add_column('statutory_settings', sa.Column('company_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_statutory_settings_company', 'statutory_settings', 'companies', ['company_id'], ['id'])
    op.create_index('ix_statutory_settings_company_id', 'statutory_settings', ['company_id'])
    op.create_unique_constraint('uq_statutory_settings_org_company', 'statutory_settings', ['organization_id', 'company_id'])

    # StatutoryRule — add company_id
    op.add_column('statutory_rules', sa.Column('company_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_statutory_rules_company', 'statutory_rules', 'companies', ['company_id'], ['id'])
    op.create_index('ix_statutory_rules_company_id', 'statutory_rules', ['company_id'])
    op.create_index('idx_sr_company_effective', 'statutory_rules', ['company_id', 'effective_from'])

    # SalaryTemplate — add company_id
    op.add_column('salary_templates', sa.Column('company_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_salary_templates_company', 'salary_templates', 'companies', ['company_id'], ['id'])
    op.create_index('ix_salary_templates_company_id', 'salary_templates', ['company_id'])


def downgrade():
    op.drop_index('ix_salary_templates_company_id', 'salary_templates')
    op.drop_constraint('fk_salary_templates_company', 'salary_templates', type_='foreignkey')
    op.drop_column('salary_templates', 'company_id')

    op.drop_index('idx_sr_company_effective', 'statutory_rules')
    op.drop_index('ix_statutory_rules_company_id', 'statutory_rules')
    op.drop_constraint('fk_statutory_rules_company', 'statutory_rules', type_='foreignkey')
    op.drop_column('statutory_rules', 'company_id')

    op.drop_constraint('uq_statutory_settings_org_company', 'statutory_settings', type_='unique')
    op.drop_index('ix_statutory_settings_company_id', 'statutory_settings')
    op.drop_constraint('fk_statutory_settings_company', 'statutory_settings', type_='foreignkey')
    op.drop_column('statutory_settings', 'company_id')

    op.drop_index('ix_tax_regimes_company_id', 'tax_regimes')
    op.drop_constraint('fk_tax_regimes_company', 'tax_regimes', type_='foreignkey')
    op.drop_column('tax_regimes', 'company_id')

    op.drop_index('ix_payroll_components_company_id', 'payroll_components')
    op.drop_constraint('fk_payroll_components_company', 'payroll_components', type_='foreignkey')
    op.drop_column('payroll_components', 'company_id')

    op.drop_index('ix_payroll_policies_company_id', 'payroll_policies')
    op.drop_constraint('fk_payroll_policies_company', 'payroll_policies', type_='foreignkey')
    op.drop_column('payroll_policies', 'company_id')
