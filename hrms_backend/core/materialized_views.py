"""
Materialized views for high-performance reporting
Pre-computes expensive aggregations for dashboards and reports
"""
from sqlalchemy import text
from sqlalchemy.orm import Session
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


def refresh_materialized_views(db: Session, organization_id: Optional[int] = None):
    """Refresh all materialized views - call this periodically or after data changes"""
    
    views = [
        ("mv_employee_summary", """
            SELECT 
                e.organization_id,
                e.company_id,
                e.department_id,
                COUNT(*) as total_employees,
                COUNT(CASE WHEN e.status = 'active' THEN 1 END) as active_employees,
                COUNT(CASE WHEN e.status = 'inactive' THEN 1 END) as inactive_employees,
                COUNT(CASE WHEN e.status = 'terminated' THEN 1 END) as terminated_employees,
                AVG(EXTRACT(YEAR FROM AGE(NOW(), e.join_date))) as avg_tenure_years
            FROM employees e
            WHERE e.deleted_at IS NULL
            GROUP BY e.organization_id, e.company_id, e.department_id
        """),
        ("mv_attendance_daily_summary", """
            SELECT 
                a.organization_id,
                a.company_id,
                a.employee_id,
                DATE(a.date) as attendance_date,
                COUNT(*) as total_punches,
                SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
                SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
                SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late_count,
                SUM(CASE WHEN a.status = 'half_day' THEN 1 ELSE 0 END) as half_day_count,
                AVG(EXTRACT(EPOCH FROM (a.check_out - a.check_in))/3600) as avg_hours_worked
            FROM attendances a
            WHERE a.deleted_at IS NULL 
                AND a.date >= NOW() - INTERVAL '90 days'
            GROUP BY a.organization_id, a.company_id, a.employee_id, DATE(a.date)
        """),
        ("mv_leave_summary", """
            SELECT 
                la.organization_id,
                la.employee_id,
                COUNT(*) as total_applications,
                SUM(CASE WHEN la.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN la.status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
                SUM(CASE WHEN la.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN la.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
                AVG(EXTRACT(EPOCH FROM (la.end_date - la.start_date))/86400) as avg_days
            FROM leave_applications la
            WHERE la.deleted_at IS NULL
                AND la.created_at >= NOW() - INTERVAL '1 year'
            GROUP BY la.organization_id, la.employee_id
        """),
        ("mv_payroll_monthly_summary", """
            SELECT 
                p.organization_id,
                p.company_id,
                p.employee_id,
                p.year,
                p.month,
                SUM(p.gross_salary) as total_gross,
                SUM(p.net_pay) as total_net_pay,
                SUM(p.total_deductions) as total_deductions,
                AVG(p.net_pay) as avg_net_pay,
                COUNT(*) as payroll_runs
            FROM payrolls p
            WHERE p.deleted_at IS NULL
                AND p.created_at >= NOW() - INTERVAL '2 years'
            GROUP BY p.organization_id, p.company_id, p.employee_id, p.year, p.month
        """),
        ("mv_expense_summary", """
            SELECT 
                e.organization_id,
                e.employee_id,
                DATE_TRUNC('month', e.expense_date) as expense_month,
                COUNT(*) as total_expenses,
                SUM(e.amount) as total_amount,
                SUM(CASE WHEN e.status = 'approved' THEN e.amount ELSE 0 END) as approved_amount,
                SUM(CASE WHEN e.status = 'pending' THEN e.amount ELSE 0 END) as pending_amount
            FROM expenses e
            WHERE e.deleted_at IS NULL
                AND e.expense_date >= NOW() - INTERVAL '1 year'
            GROUP BY e.organization_id, e.employee_id, DATE_TRUNC('month', e.expense_date)
        """),
    ]
    
    results = {}
    
    for view_name, query in views:
        try:
            # Refresh the materialized view
            db.execute(text(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {view_name}"))
            db.commit()
            
            # Get row count
            count_result = db.execute(text(f"SELECT COUNT(*) FROM {view_name}"))
            count = count_result.scalar()
            
            results[view_name] = {"status": "refreshed", "rows": count}
            logger.info(f"Refreshed materialized view {view_name}: {count} rows")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to refresh {view_name}: {e}")
            results[view_name] = {"status": "failed", "error": str(e)}
    
    return results


def create_materialized_views(db: Session):
    """Create materialized views if they don't exist"""
    
    views = [
        ("mv_employee_summary", """
            CREATE MATERIALIZED VIEW IF NOT EXISTS mv_employee_summary AS
            SELECT 
                e.organization_id,
                e.company_id,
                e.department_id,
                COUNT(*) as total_employees,
                COUNT(CASE WHEN e.status = 'active' THEN 1 END) as active_employees,
                COUNT(CASE WHEN e.status = 'inactive' THEN 1 END) as inactive_employees,
                COUNT(CASE WHEN e.status = 'terminated' THEN 1 END) as terminated_employees,
                AVG(EXTRACT(YEAR FROM AGE(NOW(), e.join_date))) as avg_tenure_years
            FROM employees e
            WHERE e.deleted_at IS NULL
            GROUP BY e.organization_id, e.company_id, e.department_id
            WITH DATA
        """),
        ("mv_attendance_daily_summary", """
            CREATE MATERIALIZED VIEW IF NOT EXISTS mv_attendance_daily_summary AS
            SELECT 
                a.organization_id,
                a.company_id,
                a.employee_id,
                DATE(a.date) as attendance_date,
                COUNT(*) as total_punches,
                SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END) as present_count,
                SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
                SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) as late_count,
                SUM(CASE WHEN a.status = 'half_day' THEN 1 ELSE 0 END) as half_day_count,
                AVG(EXTRACT(EPOCH FROM (a.check_out - a.check_in))/3600) as avg_hours_worked
            FROM attendances a
            WHERE a.deleted_at IS NULL 
                AND a.date >= NOW() - INTERVAL '90 days'
            GROUP BY a.organization_id, a.company_id, a.employee_id, DATE(a.date)
            WITH DATA
        """),
        ("mv_leave_summary", """
            CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leave_summary AS
            SELECT 
                la.organization_id,
                la.employee_id,
                COUNT(*) as total_applications,
                SUM(CASE WHEN la.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
                SUM(CASE WHEN la.status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
                SUM(CASE WHEN la.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                SUM(CASE WHEN la.status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
                AVG(EXTRACT(EPOCH FROM (la.end_date - la.start_date))/86400) as avg_days
            FROM leave_applications la
            WHERE la.deleted_at IS NULL
                AND la.created_at >= NOW() - INTERVAL '1 year'
            GROUP BY la.organization_id, la.employee_id
            WITH DATA
        """),
        ("mv_payroll_monthly_summary", """
            CREATE MATERIALIZED VIEW IF NOT EXISTS mv_payroll_monthly_summary AS
            SELECT 
                p.organization_id,
                p.company_id,
                p.employee_id,
                p.year,
                p.month,
                SUM(p.gross_salary) as total_gross,
                SUM(p.net_pay) as total_net_pay,
                SUM(p.total_deductions) as total_deductions,
                AVG(p.net_pay) as avg_net_pay,
                COUNT(*) as payroll_runs
            FROM payrolls p
            WHERE p.deleted_at IS NULL
                AND p.created_at >= NOW() - INTERVAL '2 years'
            GROUP BY p.organization_id, p.company_id, p.employee_id, p.year, p.month
            WITH DATA
        """),
        ("mv_expense_summary", """
            CREATE MATERIALIZED VIEW IF NOT EXISTS mv_expense_summary AS
            SELECT 
                e.organization_id,
                e.employee_id,
                DATE_TRUNC('month', e.expense_date) as expense_month,
                COUNT(*) as total_expenses,
                SUM(e.amount) as total_amount,
                SUM(CASE WHEN e.status = 'approved' THEN e.amount ELSE 0 END) as approved_amount,
                SUM(CASE WHEN e.status = 'pending' THEN e.amount ELSE 0 END) as pending_amount
            FROM expenses e
            WHERE e.deleted_at IS NULL
                AND e.expense_date >= NOW() - INTERVAL '1 year'
            GROUP BY e.organization_id, e.employee_id, DATE_TRUNC('month', e.expense_date)
            WITH DATA
        """),
    ]
    
    # Create indexes on materialized views
    mv_indexes = [
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_employee_summary_org ON mv_employee_summary(organization_id, company_id, department_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_attendance_daily_org_emp_date ON mv_attendance_daily_summary(organization_id, employee_id, attendance_date)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_leave_summary_org_emp ON mv_leave_summary(organization_id, employee_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_payroll_monthly_org_emp_period ON mv_payroll_monthly_summary(organization_id, employee_id, year, month)",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_expense_summary_org_emp_month ON mv_expense_summary(organization_id, employee_id, expense_month)",
    ]
    
    for view_name, query in views:
        try:
            db.execute(text(f"DROP MATERIALIZED VIEW IF EXISTS {view_name} CASCADE"))
            db.execute(text(query))
            db.commit()
            logger.info(f"Created materialized view: {view_name}")
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create {view_name}: {e}")
    
    for idx_sql in mv_indexes:
        try:
            db.execute(text(idx_sql))
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to create MV index: {e}")


def query_materialized_view(db: Session, view_name: str, organization_id: Optional[int] = None, limit: int = 1000) -> list:
    """Query a materialized view with optional organization filter"""
    
    view_queries = {
        "mv_employee_summary": "SELECT * FROM mv_employee_summary WHERE organization_id = :org_id LIMIT :limit",
        "mv_attendance_daily_summary": "SELECT * FROM mv_attendance_daily_summary WHERE organization_id = :org_id LIMIT :limit",
        "mv_leave_summary": "SELECT * FROM mv_leave_summary WHERE organization_id = :org_id LIMIT :limit",
        "mv_payroll_monthly_summary": "SELECT * FROM mv_payroll_monthly_summary WHERE organization_id = :org_id LIMIT :limit",
        "mv_expense_summary": "SELECT * FROM mv_expense_summary WHERE organization_id = :org_id LIMIT :limit",
    }
    
    if view_name not in view_queries:
        raise ValueError(f"Unknown materialized view: {view_name}")
    
    query = view_queries[view_name]
    
    if organization_id:
        result = db.execute(text(query), {"org_id": organization_id, "limit": limit})
    else:
        result = db.execute(text(f"SELECT * FROM {view_name} LIMIT :limit"), {"limit": limit})
    
    return [dict(row._mapping) for row in result]
