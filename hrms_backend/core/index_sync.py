"""
Enterprise index synchronization.

Creates the composite/covering indexes defined on the ORM models
in an idempotent way (CREATE INDEX IF NOT EXISTS) against the live
database. Safe to run at every startup.

These indexes back the tenant-isolation hot path
(WHERE organization_id = ?) and the time-series query patterns used
by attendance / payroll / leave / expense list endpoints.
"""
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

_INDEXES = [
    # employees — live rows only (partial index target)
    "CREATE INDEX IF NOT EXISTS idx_emp_org_status ON employees(organization_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_emp_org_status_live ON employees(organization_id, status) WHERE deleted_at IS NULL",
    "CREATE INDEX IF NOT EXISTS idx_emp_org_deleted ON employees(organization_id, deleted_at)",
    "CREATE INDEX IF NOT EXISTS idx_emp_company_status ON employees(company_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_emp_org_id ON employees(organization_id, id)",
    "CREATE INDEX IF NOT EXISTS idx_emp_department_status ON employees(department_id, status)",
    # attendances
    "CREATE INDEX IF NOT EXISTS idx_att_org_date ON attendances(organization_id, date)",
    "CREATE INDEX IF NOT EXISTS idx_att_emp_date ON attendances(employee_id, date)",
    "CREATE INDEX IF NOT EXISTS idx_att_emp_open ON attendances(employee_id) WHERE check_out IS NULL AND deleted_at IS NULL",
    """CREATE UNIQUE INDEX IF NOT EXISTS uq_att_emp_open_session
       ON attendances(employee_id) WHERE check_out IS NULL AND deleted_at IS NULL""",
    "CREATE INDEX IF NOT EXISTS idx_att_company_date ON attendances(company_id, date)",
    "CREATE INDEX IF NOT EXISTS idx_att_org_emp_date ON attendances(organization_id, employee_id, date)",
    "CREATE INDEX IF NOT EXISTS idx_att_org_status_date ON attendances(organization_id, status, date)",
    # leave_applications
    "CREATE INDEX IF NOT EXISTS idx_leave_org_status ON leave_applications(organization_id, status)",
    "CREATE INDEX IF NOT EXISTS idx_leave_emp_start ON leave_applications(employee_id, start_date)",
    "CREATE INDEX IF NOT EXISTS idx_leave_org_start ON leave_applications(organization_id, start_date)",
    "CREATE INDEX IF NOT EXISTS idx_leave_org_emp_status ON leave_applications(organization_id, employee_id, status)",
    # payrolls
    "CREATE INDEX IF NOT EXISTS idx_pay_org_period ON payrolls(organization_id, year, month)",
    "CREATE INDEX IF NOT EXISTS idx_pay_emp_period ON payrolls(employee_id, year, month)",
    "CREATE INDEX IF NOT EXISTS idx_pay_company_period ON payrolls(company_id, year, month)",
    "CREATE INDEX IF NOT EXISTS idx_pay_org_status_period ON payrolls(organization_id, status, year, month)",
    # expenses
    "CREATE INDEX IF NOT EXISTS idx_exp_org_status_date ON expenses(organization_id, status, expense_date)",
    "CREATE INDEX IF NOT EXISTS idx_exp_emp_date ON expenses(employee_id, expense_date)",
    "CREATE INDEX IF NOT EXISTS idx_exp_org_date ON expenses(organization_id, expense_date)",
    # notifications
    "CREATE INDEX IF NOT EXISTS idx_notif_user_created ON notifications(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, is_read)",
    # audit_logs
    "CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs(organization_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_module_created ON audit_logs(module, created_at)",
    # employee text search (requires pg_trgm — safe to skip on SQLite dev)
    "CREATE EXTENSION IF NOT EXISTS pg_trgm",
    """CREATE INDEX IF NOT EXISTS idx_emp_code_lower ON employees (lower(employee_code))
       WHERE deleted_at IS NULL""",
    """CREATE INDEX IF NOT EXISTS idx_emp_email_lower ON employees (lower(email))
       WHERE deleted_at IS NULL""",
    """CREATE INDEX IF NOT EXISTS idx_emp_name_trgm ON employees
       USING gin ((lower(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) gin_trgm_ops)""",
]


def _reconcile_duplicate_open_attendance_sessions(conn) -> int:
    """
    Close stale duplicate open check-in rows so the partial unique index
    (one open session per employee) can be created safely.
    Keeps the newest open session per employee.
    """
    if conn.dialect.name != "postgresql":
        return 0

    result = conn.execute(
        text(
            """
            WITH ranked AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY employee_id
                           ORDER BY COALESCE(check_in, date) DESC, id DESC
                       ) AS rn
                FROM attendances
                WHERE check_out IS NULL AND deleted_at IS NULL
            )
            UPDATE attendances AS a
            SET check_out = COALESCE(a.check_in, a.date, NOW()),
                updated_at = NOW()
            FROM ranked AS r
            WHERE a.id = r.id AND r.rn > 1
            """
        )
    )
    closed = result.rowcount or 0
    if closed:
        logger.warning(
            "Closed %d duplicate open attendance session(s) before index sync",
            closed,
        )
    return closed


def sync_enterprise_indexes(engine) -> None:
    """Create all enterprise composite indexes if they do not exist."""
    created = 0
    skipped = 0
    try:
        with engine.connect() as conn:
            _reconcile_duplicate_open_attendance_sessions(conn)
            conn.commit()
    except Exception as e:  # noqa: BLE001
        logger.warning("Attendance session reconciliation skipped: %s", e)

    for sql in _INDEXES:
        try:
            with engine.begin() as conn:
                conn.execute(text(sql))
            created += 1
        except Exception as e:  # noqa: BLE001
            skipped += 1
            logger.warning("Index creation skipped for %s: %s", sql[:60].strip(), e)

    logger.info(
        "Enterprise indexes synchronized (%d ok, %d skipped).",
        created,
        skipped,
    )
