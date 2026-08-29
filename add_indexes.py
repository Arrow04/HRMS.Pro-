import sqlalchemy

e = sqlalchemy.create_engine('postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev')
c = e.connect()

indexes = [
    # Employee search indexes (used in WHERE ilike)
    "CREATE INDEX IF NOT EXISTS idx_emp_search_name ON employees (first_name gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS idx_emp_search_email ON employees (email gin_trgm_ops)",
    "CREATE INDEX IF NOT EXISTS idx_emp_search_code ON employees (employee_code gin_trgm_ops)",
    # Composite indexes for common filter combos
    "CREATE INDEX IF NOT EXISTS idx_emp_org_status ON employees (organization_id, status, deleted_at)",
    "CREATE INDEX IF NOT EXISTS idx_emp_company_status ON employees (company_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_emp_dept ON employees (department_id) WHERE department_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_emp_join_date ON employees (join_date)",
    # Attendance hot-path indexes
    "CREATE INDEX IF NOT EXISTS idx_att_emp_date_status ON attendances (employee_id, date, status)",
    "CREATE INDEX IF NOT EXISTS idx_att_date_status ON attendances (date, status)",
    "CREATE INDEX IF NOT EXISTS idx_att_checkin_range ON attendances (check_in) WHERE check_in IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS idx_att_org_date ON attendances (organization_id, date)",
    # Leave indexes
    "CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_applications (status)",
    "CREATE INDEX IF NOT EXISTS idx_leave_emp_status ON leave_applications (employee_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_leave_dates ON leave_applications (start_date, end_date)",
    "CREATE INDEX IF NOT EXISTS idx_leave_updated ON leave_applications (updated_at)",
    # Expense indexes
    "CREATE INDEX IF NOT EXISTS idx_exp_status ON expenses (status)",
    "CREATE INDEX IF NOT EXISTS idx_exp_emp ON expenses (employee_id)",
    # Payroll indexes
    "CREATE INDEX IF NOT EXISTS idx_payroll_month ON payrolls (month)",
    "CREATE INDEX IF NOT EXISTS idx_payroll_status ON payrolls (status)",
    "CREATE INDEX IF NOT EXISTS idx_payroll_emp ON payrolls (employee_id)",
    # Notification indexes
    "CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications (user_id, is_read)",
]

# Enable pg_trgm extension for trigram search
try:
    c.execute(sqlalchemy.text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    c.commit()
    print("pg_trgm extension enabled")
except:
    print("pg_trgm already exists or not available")

for idx_sql in indexes:
    try:
        c.execute(sqlalchemy.text(idx_sql))
        c.commit()
        name = idx_sql.split("IF NOT EXISTS ")[1].split(" ")[0] if "IF NOT EXISTS" in idx_sql else "unknown"
        print(f"  Created: {name}")
    except Exception as ex:
        c.rollback()
        if 'already exists' in str(ex):
            pass  # skip
        else:
            print(f"  Skipped: {idx_sql[:60]}... ({ex})")

c.close()
print("\nIndex creation complete!")
