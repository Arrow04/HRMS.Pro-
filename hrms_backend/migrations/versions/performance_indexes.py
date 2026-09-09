"""
High-performance database indexes for HRMS Enterprise
Adds indexes for high-volume query patterns to support millions of records
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers
revision = 'performance_indexes'
down_revision = '61ccabab0369'
branch_labels = None
depends_on = None


def upgrade():
    """Add performance-critical indexes for high-volume data"""
    
    indexes = [
        # Users & Authentication
        ("ix_users_email_perf", "users", "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_perf ON users(email) WHERE deleted_at IS NULL"),
        ("ix_users_role_status", "users", "CREATE INDEX IF NOT EXISTS ix_users_role_status ON users(role, is_active, created_at) WHERE deleted_at IS NULL"),
        ("ix_users_org_role", "users", "CREATE INDEX IF NOT EXISTS ix_users_org_role ON users(organization_id, role) WHERE deleted_at IS NULL"),
        ("ix_users_last_login", "users", "CREATE INDEX IF NOT EXISTS ix_users_last_login ON users(last_login DESC) WHERE deleted_at IS NULL AND last_login IS NOT NULL"),
        
        # Employees - Most queried table
        ("ix_emp_org_status_active", "employees", "CREATE INDEX IF NOT EXISTS ix_emp_org_status_active ON employees(organization_id, status, id) WHERE deleted_at IS NULL"),
        ("ix_emp_company_dept", "employees", "CREATE INDEX IF NOT EXISTS ix_emp_company_dept ON employees(company_id, department_id, status) WHERE deleted_at IS NULL"),
        ("ix_emp_code_unique", "employees", "CREATE UNIQUE INDEX IF NOT EXISTS ix_emp_code_unique ON employees(organization_id, lower(employee_code)) WHERE deleted_at IS NULL"),
        ("ix_emp_email_unique", "employees", "CREATE UNIQUE INDEX IF NOT EXISTS ix_emp_email_unique ON employees(lower(email)) WHERE deleted_at IS NULL"),
        ("ix_emp_join_date", "employees", "CREATE INDEX IF NOT EXISTS ix_emp_join_date ON employees(organization_id, date_of_joining DESC) WHERE deleted_at IS NULL"),
        ("ix_emp_search_gin", "employees", "CREATE INDEX IF NOT EXISTS ix_emp_search_gin ON employees USING gin(to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, ''))) WHERE deleted_at IS NULL"),
        
        # Attendance - High write volume
        ("ix_att_emp_date_desc", "attendances", "CREATE INDEX IF NOT EXISTS ix_att_emp_date_desc ON attendances(employee_id, date DESC, id DESC) WHERE deleted_at IS NULL"),
        ("ix_att_org_date_status", "attendances", "CREATE INDEX IF NOT EXISTS ix_att_org_date_status ON attendances(organization_id, date, status) WHERE deleted_at IS NULL"),
        ("ix_att_company_date", "attendances", "CREATE INDEX IF NOT EXISTS ix_att_company_date ON attendances(company_id, date DESC) WHERE deleted_at IS NULL"),
        ("ix_att_open_session", "attendances", "CREATE UNIQUE INDEX IF NOT EXISTS ix_att_open_session ON attendances(employee_id) WHERE check_out IS NULL AND deleted_at IS NULL AND status != 'absent'"),
        ("ix_att_punch_time", "attendances", "CREATE INDEX IF NOT EXISTS ix_att_punch_time ON attendances(check_in, check_out) WHERE deleted_at IS NULL"),
        
        # Leave Applications
        ("ix_leave_emp_status_dates", "leave_applications", "CREATE INDEX IF NOT EXISTS ix_leave_emp_status_dates ON leave_applications(employee_id, status, start_date, end_date) WHERE deleted_at IS NULL"),
        ("ix_leave_org_status_start", "leave_applications", "CREATE INDEX IF NOT EXISTS ix_leave_org_status_start ON leave_applications(organization_id, status, start_date DESC) WHERE deleted_at IS NULL"),
        ("ix_leave_approver_pending", "leave_applications", "CREATE INDEX IF NOT EXISTS ix_leave_approver_pending ON leave_applications(approved_by, status, created_at) WHERE status = 'pending' AND deleted_at IS NULL"),
        
        # Payroll - Critical for reporting
        ("ix_payroll_emp_period_unique", "payrolls", "CREATE UNIQUE INDEX IF NOT EXISTS ix_payroll_emp_period_unique ON payrolls(employee_id, month, year) WHERE deleted_at IS NULL"),
        ("ix_payroll_org_period_status", "payrolls", "CREATE INDEX IF NOT EXISTS ix_payroll_org_period_status ON payrolls(organization_id, year, month, status) WHERE deleted_at IS NULL"),
        ("ix_payroll_company_period", "payrolls", "CREATE INDEX IF NOT EXISTS ix_payroll_company_period ON payrolls(company_id, year DESC, month DESC) WHERE deleted_at IS NULL"),
        ("ix_payroll_emp_net_pay", "payrolls", "CREATE INDEX IF NOT EXISTS ix_payroll_emp_net_pay ON payrolls(employee_id, net_pay DESC) WHERE deleted_at IS NULL"),
        
        # Expenses
        ("ix_expense_emp_date_status", "expenses", "CREATE INDEX IF NOT EXISTS ix_expense_emp_date_status ON expenses(employee_id, expense_date DESC, status) WHERE deleted_at IS NULL"),
        ("ix_expense_org_status_date", "expenses", "CREATE INDEX IF NOT EXISTS ix_expense_org_status_date ON expenses(organization_id, status, expense_date DESC) WHERE deleted_at IS NULL"),
        ("ix_expense_pending_approval", "expenses", "CREATE INDEX IF NOT EXISTS ix_expense_pending_approval ON expenses(approved_by, status, created_at) WHERE status = 'pending' AND deleted_at IS NULL"),
        
        # Notifications
        ("ix_notification_user_created", "notifications", "CREATE INDEX IF NOT EXISTS ix_notification_user_created ON notifications(user_id, created_at DESC) WHERE deleted_at IS NULL"),
        ("ix_notification_user_unread", "notifications", "CREATE INDEX IF NOT EXISTS ix_notification_user_unread ON notifications(user_id, is_read, created_at DESC) WHERE deleted_at IS NULL AND is_read = false"),
        
        # Audit Logs - High volume, append-only
        ("ix_audit_org_created", "audit_logs", "CREATE INDEX IF NOT EXISTS ix_audit_org_created ON audit_logs(organization_id, created_at DESC) WHERE deleted_at IS NULL"),
        ("ix_audit_user_created", "audit_logs", "CREATE INDEX IF NOT EXISTS ix_audit_user_created ON audit_logs(user_id, created_at DESC) WHERE deleted_at IS NULL"),
        ("ix_audit_module_created", "audit_logs", "CREATE INDEX IF NOT EXISTS ix_audit_module_created ON audit_logs(module, created_at DESC) WHERE deleted_at IS NULL"),
        ("ix_audit_action_created", "audit_logs", "CREATE INDEX IF NOT EXISTS ix_audit_action_created ON audit_logs(action, created_at DESC) WHERE deleted_at IS NULL"),
        
        # Recruitment
        ("ix_job_opening_org_status", "job_openings", "CREATE INDEX IF NOT EXISTS ix_job_opening_org_status ON job_openings(organization_id, status, created_at DESC) WHERE deleted_at IS NULL"),
        ("ix_candidate_job_status", "candidates", "CREATE INDEX IF NOT EXISTS ix_candidate_job_status ON candidates(job_opening_id, status, created_at DESC) WHERE deleted_at IS NULL"),
        ("ix_interview_candidate_date", "interviews", "CREATE INDEX IF NOT EXISTS ix_interview_candidate_date ON interviews(candidate_id, interview_date DESC) WHERE deleted_at IS NULL"),
        
        # Performance
        ("ix_performance_review_emp_cycle", "performance_reviews", "CREATE INDEX IF NOT EXISTS ix_performance_review_emp_cycle ON performance_reviews(employee_id, review_cycle_id, status) WHERE deleted_at IS NULL"),
        ("ix_goals_employee_deadline", "goals", "CREATE INDEX IF NOT EXISTS ix_goals_employee_deadline ON goals(employee_id, deadline DESC, status) WHERE deleted_at IS NULL"),
        
        # Assets
        ("ix_asset_employee_status", "assets", "CREATE INDEX IF NOT EXISTS ix_asset_employee_status ON assets(employee_id, status, created_at DESC) WHERE deleted_at IS NULL"),
        ("ix_asset_company_status", "assets", "CREATE INDEX IF NOT EXISTS ix_asset_company_status ON assets(company_id, status) WHERE deleted_at IS NULL"),
        
        # Organizations & Companies
        ("ix_org_status_created", "organizations", "CREATE INDEX IF NOT EXISTS ix_org_status_created ON organizations(status, created_at DESC) WHERE deleted_at IS NULL"),
        ("ix_company_org_status", "companies", "CREATE INDEX IF NOT EXISTS ix_company_org_status ON companies(organization_id, status) WHERE deleted_at IS NULL"),
        
        # Lookup/Master Data
        ("ix_lookup_category_code", "lookup_categories", "CREATE UNIQUE INDEX IF NOT EXISTS ix_lookup_category_code ON lookup_categories(code) WHERE deleted_at IS NULL"),
        ("ix_lookup_category_parent", "lookup_categories", "CREATE INDEX IF NOT EXISTS ix_lookup_category_parent ON lookup_categories(parent_id, sort_order) WHERE deleted_at IS NULL"),
        
        # Documents & Archives
        ("ix_archived_employee_org", "archived_employees", "CREATE INDEX IF NOT EXISTS ix_archived_employee_org ON archived_employees(organization_id, exit_date DESC) WHERE deleted_at IS NULL"),
        ("ix_exit_record_employee", "exit_records", "CREATE UNIQUE INDEX IF NOT EXISTS ix_exit_record_employee ON exit_records(employee_id) WHERE deleted_at IS NULL"),
    ]
    
    conn = op.get_bind()
    for idx_name, table, sql in indexes:
        try:
            op.execute(text(f"DROP INDEX IF EXISTS {idx_name}"))
            op.execute(text(sql))
            print(f"Created index: {idx_name} on {table}")
        except Exception as e:
            print(f"Warning: Could not create index {idx_name}: {e}")
    
    # Analyze tables for query planner
    tables_to_analyze = [
        "users", "employees", "attendances", "leave_applications", "payrolls",
        "expenses", "notifications", "audit_logs", "job_openings", "candidates",
        "interviews", "performance_reviews", "goals", "assets", "organizations",
        "companies", "departments", "branches", "designations", "archived_employees"
    ]
    
    for table in tables_to_analyze:
        try:
            op.execute(text(f"ANALYZE {table}"))
        except Exception as e:
            print(f"Warning: Could not analyze {table}: {e}")


def downgrade():
    """Remove performance indexes"""
    conn = op.get_bind()
    
    indexes_to_drop = [
        "ix_users_email_perf", "ix_users_role_status", "ix_users_org_role", "ix_users_last_login",
        "ix_emp_org_status_active", "ix_emp_company_dept", "ix_emp_code_unique", "ix_emp_email_unique",
        "ix_emp_join_date", "ix_emp_search_gin", "ix_att_emp_date_desc", "ix_att_org_date_status",
        "ix_att_company_date", "ix_att_open_session", "ix_att_punch_time", "ix_leave_emp_status_dates",
        "ix_leave_org_status_start", "ix_leave_approver_pending", "ix_payroll_emp_period_unique",
        "ix_payroll_org_period_status", "ix_payroll_company_period", "ix_payroll_emp_net_pay",
        "ix_expense_emp_date_status", "ix_expense_org_status_date", "ix_expense_pending_approval",
        "ix_notification_user_created", "ix_notification_user_unread", "ix_audit_org_created",
        "ix_audit_user_created", "ix_audit_module_created", "ix_audit_action_created",
        "ix_job_opening_org_status", "ix_candidate_job_status", "ix_interview_candidate_date",
        "ix_performance_review_emp_cycle", "ix_goals_employee_deadline", "ix_asset_employee_status",
        "ix_asset_company_status", "ix_org_status_created", "ix_company_org_status",
        "ix_lookup_category_code", "ix_lookup_category_parent", "ix_archived_employee_org",
        "ix_exit_record_employee"
    ]
    
    for idx_name in indexes_to_drop:
        try:
            op.execute(text(f"DROP INDEX IF EXISTS {idx_name}"))
        except Exception:
            pass
