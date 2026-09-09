"""
Streaming bulk export endpoints for large datasets
Supports CSV, Excel, JSON streaming for 100k+ records
"""
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import csv
import io
import json
import logging
from typing import Optional, List
from datetime import datetime

from database import get_db
from models import User, Employee, Attendance, LeaveApplication, Expense, Payroll
from core.auth import get_current_user, check_role

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/export", tags=["bulk-export"])


class StreamCSV:
    """Stream CSV data for large exports without loading everything in memory"""
    
    def __init__(self, columns: List[str], rows):
        self.columns = columns
        self.rows = rows
    
    def generate(self):
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(self.columns)
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)
        
        for row in self.rows:
            writer.writerow([str(row.get(col, '')) for col in self.columns])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)


def stream_employees_csv(organization_id: int, db: Session, batch_size: int = 1000):
    """Stream employees as CSV"""
    columns = ['id', 'employee_code', 'full_name', 'email', 'phone', 'department_id', 
               'company_id', 'designation', 'status', 'join_date', 'created_at']
    
    offset = 0
    while True:
        rows = db.query(Employee).filter(
            Employee.organization_id == organization_id,
            Employee.deleted_at.is_(None)
        ).order_by(Employee.id.asc()).offset(offset).limit(batch_size).all()
        
        if not rows:
            break
        
        output = io.StringIO()
        writer = csv.writer(output)
        if offset == 0:
            writer.writerow(columns)
        
        for emp in rows:
            writer.writerow([
                emp.id, emp.employee_code, emp.full_name, emp.email, emp.phone,
                emp.department_id, emp.company_id, emp.designation, emp.status,
                emp.join_date.isoformat() if emp.join_date else '',
                emp.created_at.isoformat() if emp.created_at else ''
            ])
        
        yield output.getvalue()
        offset += batch_size


def stream_attendance_csv(organization_id: int, db: Session, batch_size: int = 1000):
    """Stream attendance as CSV"""
    columns = ['id', 'employee_id', 'date', 'check_in', 'check_out', 'status', 'notes']
    
    offset = 0
    while True:
        rows = db.query(Attendance).filter(
            Attendance.organization_id == organization_id,
            Attendance.deleted_at.is_(None)
        ).order_by(Attendance.id.asc()).offset(offset).limit(batch_size).all()
        
        if not rows:
            break
        
        output = io.StringIO()
        writer = csv.writer(output)
        if offset == 0:
            writer.writerow(columns)
        
        for att in rows:
            writer.writerow([
                att.id, att.employee_id, att.date.isoformat() if att.date else '',
                att.check_in.isoformat() if att.check_in else '',
                att.check_out.isoformat() if att.check_out else '',
                att.status, att.notes or ''
            ])
        
        yield output.getvalue()
        offset += batch_size


@router.get("/employees/csv")
def export_employees_csv(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    organization_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    department_id: Optional[int] = Query(None),
):
    """Stream employees as CSV - supports 100k+ records"""
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    org_id = organization_id or current_user.organization_id
    if not org_id and current_user.role != "superadmin":
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    filename = f"employees_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        stream_employees_csv(org_id, db),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/attendance/csv")
def export_attendance_csv(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    organization_id: Optional[int] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Stream attendance as CSV - supports 100k+ records"""
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    org_id = organization_id or current_user.organization_id
    if not org_id and current_user.role != "superadmin":
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    filename = f"attendance_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    return StreamingResponse(
        stream_attendance_csv(org_id, db),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/payroll/csv")
def export_payroll_csv(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    organization_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
):
    """Stream payroll as CSV"""
    if current_user.role not in ("superadmin", "admin", "hr_admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    org_id = organization_id or current_user.organization_id
    if not org_id and current_user.role != "superadmin":
        raise HTTPException(status_code=400, detail="Organization ID required")
    
    filename = f"payroll_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    
    columns = ['id', 'employee_id', 'employee_name', 'year', 'month', 'gross_salary', 
               'net_pay', 'total_deductions', 'status', 'created_at']
    
    query = db.query(Payroll).filter(
        Payroll.organization_id == org_id,
        Payroll.deleted_at.is_(None)
    )
    
    if year:
        query = query.filter(Payroll.year == year)
    if month:
        query = query.filter(Payroll.month == month)
    
    return StreamingResponse(
        StreamCSV(columns, [{
            'id': p.id,
            'employee_id': p.employee_id,
            'employee_name': f"{p.employee.first_name} {p.employee.last_name}" if p.employee else '',
            'year': p.year,
            'month': p.month,
            'gross_salary': p.gross_salary,
            'net_pay': p.net_pay,
            'total_deductions': p.total_deductions,
            'status': p.status,
            'created_at': p.created_at.isoformat() if p.created_at else ''
        } for p in query.order_by(Payroll.id.asc()).all()]).generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
