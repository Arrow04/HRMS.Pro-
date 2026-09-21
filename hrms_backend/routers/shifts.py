"""
Shift and Duty Roster Management Router
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, timedelta
from core.datetime_utils import ist_now_naive
from pydantic import BaseModel

from database import get_db
from models import Shift, DutyRoster, Employee, User, Company, Branch, Department
from routers.auth import get_current_user
from core.tenant import org_owned, get_employee_in_org, validate_company_in_org
from core.company_scope import resolve_company_scope, assert_company_allowed, require_write_company

router = APIRouter(tags=["Shifts & Roster"])

# ============ Pydantic Schemas ============

class ShiftBase(BaseModel):
    name: str
    code: str
    shift_type: str = "morning"  # morning, evening, night, general
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    grace_minutes: int = 15
    break_duration: int = 60
    working_days: str = "0,1,2,3,4,5,6"  # Comma-separated
    color: str = "#3B82F6"
    description: Optional[str] = None
    organization_id: int
    company_id: Optional[int] = None
    branch_id: Optional[int] = None
    department_id: Optional[int] = None
    status: str = "active"

class ShiftCreate(ShiftBase):
    pass

class ShiftResponse(ShiftBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class RosterAssignment(BaseModel):
    employee_id: int
    shift_id: int
    week_start_date: str  # YYYY-MM-DD (Monday)
    day_of_week: int  # 0=Sun, 1=Mon, ..., 6=Sat
    specific_date: Optional[str] = None  # YYYY-MM-DD
    notes: Optional[str] = None

class RosterBulkAssignment(BaseModel):
    employee_ids: List[int]
    shift_id: int
    week_start_date: str
    days: List[int]  # [1,2,3,4,5] for Mon-Fri
    notes: Optional[str] = None

class RosterResponse(BaseModel):
    id: int
    employee_id: int
    shift_id: int
    week_start_date: datetime
    day_of_week: int
    specific_date: Optional[datetime]
    status: str
    notes: Optional[str]
    employee_name: str
    shift_name: str
    shift_color: str
    shift_start_time: str
    shift_end_time: str

    class Config:
        from_attributes = True

# ============ Shift Endpoints ============

@router.get("", response_model=List[ShiftResponse])
def get_shifts(
    organization_id: Optional[int] = None,
    company_id: Optional[int] = None,
    branch_id: Optional[int] = None,
    department_id: Optional[int] = None,
    shift_type: Optional[str] = None,
    status: str = "active",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all shifts with optional filtering (company-scoped for restricted roles)."""
    query = db.query(Shift)

    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(Shift.organization_id == current_user.organization_id)
    elif organization_id:
        query = query.filter(Shift.organization_id == organization_id)
    company_id = resolve_company_scope(db, current_user, company_id)
    if company_id:
        from sqlalchemy import or_
        query = query.filter(or_(Shift.company_id == company_id, Shift.company_id == None))
    if shift_type:
        query = query.filter(Shift.shift_type == shift_type)
    if status:
        query = query.filter(Shift.status == status)
    
    return query.order_by(Shift.name).all()

@router.post("/", response_model=ShiftResponse)
def create_shift(
    shift: ShiftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new shift"""
    data = shift.dict()
    if current_user.role != "superadmin":
        data["organization_id"] = current_user.organization_id
        if data.get("company_id"):
            validate_company_in_org(db, Company, data["company_id"], current_user.organization_id)
        if data.get("company_id") not in (None, "", 0):
            data["company_id"] = require_write_company(db, current_user, data["company_id"])
        if data.get("branch_id"):
            br = db.query(Branch).filter(Branch.id == data["branch_id"]).first()
            if br is None or int(br.organization_id) != int(current_user.organization_id):
                raise HTTPException(status_code=404, detail="Branch not found")
        if data.get("department_id"):
            dep = db.query(Department).filter(Department.id == data["department_id"]).first()
            if dep is None or int(dep.organization_id) != int(current_user.organization_id):
                raise HTTPException(status_code=404, detail="Department not found")
    else:
        if not data.get("organization_id"):
            raise HTTPException(status_code=400, detail="organization_id is required for superadmin")

    dup = db.query(Shift).filter(Shift.code == data["code"])
    if dup.first():
        raise HTTPException(status_code=400, detail=f"Shift code '{data['code']}' already exists. Please choose a different code.")
    db_shift = Shift(**data)
    db.add(db_shift)
    db.commit()
    db.refresh(db_shift)
    return db_shift

@router.put("/{shift_id}", response_model=ShiftResponse)
def update_shift(
    shift_id: int,
    shift: ShiftCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing shift"""
    db_shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not db_shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    if current_user.role != "superadmin":
        org_owned(db_shift, current_user.organization_id)
    assert_company_allowed(db, current_user, db_shift.company_id)
    for key, value in shift.dict().items():
        if key in ("organization_id", "company_id"):
            continue
        setattr(db_shift, key, value)
    
    db_shift.updated_at = ist_now_naive()
    db.commit()
    db.refresh(db_shift)
    return db_shift

@router.delete("/{shift_id}")
def delete_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Soft delete a shift"""
    db_shift = db.query(Shift).filter(Shift.id == shift_id).first()
    if not db_shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    
    if current_user.role != "superadmin":
        org_owned(db_shift, current_user.organization_id)
    assert_company_allowed(db, current_user, db_shift.company_id)
    db_shift.status = "inactive"
    db_shift.updated_at = ist_now_naive()
    db.commit()
    return {"message": "Shift deactivated successfully"}

# ============ Roster Endpoints ============

@router.get("/roster/weekly", response_model=List[RosterResponse])
def get_weekly_roster(
    week_start_date: str,  # YYYY-MM-DD (should be Monday)
    organization_id: Optional[int] = None,
    company_id: Optional[int] = None,
    branch_id: Optional[int] = None,
    department_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get weekly roster for employees"""
    # Parse date
    week_start = datetime.strptime(week_start_date, "%Y-%m-%d")
    
    query = db.query(
        DutyRoster,
        Employee,
        Shift.name.label('shift_name'),
        Shift.color.label('shift_color'),
        Shift.start_time.label('shift_start_time'),
        Shift.end_time.label('shift_end_time')
    ).join(Employee, DutyRoster.employee_id == Employee.id
    ).join(Shift, DutyRoster.shift_id == Shift.id
    ).filter(DutyRoster.week_start_date == week_start)
    
    if current_user.role != "superadmin" and current_user.organization_id:
        query = query.filter(Employee.organization_id == current_user.organization_id)
    if employee_id:
        if current_user.role != "superadmin":
            _rost_emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
            assert_company_allowed(db, current_user, _rost_emp.company_id)
        query = query.filter(DutyRoster.employee_id == employee_id)
    company_id = resolve_company_scope(db, current_user, company_id)
    if company_id:
        query = query.filter(Employee.company_id == company_id)
    
    results = query.all()
    
    roster_list = []
    for roster, employee, shift_name, shift_color, shift_start, shift_end in results:
        roster_list.append({
            **roster.__dict__,
            'employee_name': employee.full_name,
            'shift_name': shift_name,
            'shift_color': shift_color,
            'shift_start_time': shift_start,
            'shift_end_time': shift_end
        })
    
    return roster_list

@router.post("/roster/assign")
def assign_shift(
    assignment: RosterAssignment,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Assign shift to employee for a specific day"""
    if current_user.role != "superadmin":
        _asg_emp = get_employee_in_org(db, Employee, assignment.employee_id, current_user.organization_id)
        assert_company_allowed(db, current_user, _asg_emp.company_id)
        shift = db.query(Shift).filter(Shift.id == assignment.shift_id).first()
        if shift is None or int(shift.organization_id) != int(current_user.organization_id):
            raise HTTPException(status_code=404, detail="Shift not found")
        assert_company_allowed(db, current_user, shift.company_id)
    week_start = datetime.strptime(assignment.week_start_date, "%Y-%m-%d")
    specific_date = datetime.strptime(assignment.specific_date, "%Y-%m-%d") if assignment.specific_date else None
    
    # Check if assignment already exists
    existing = db.query(DutyRoster).filter(
        DutyRoster.employee_id == assignment.employee_id,
        DutyRoster.week_start_date == week_start,
        DutyRoster.day_of_week == assignment.day_of_week
    ).first()
    
    if existing:
        # Update existing
        existing.shift_id = assignment.shift_id
        existing.specific_date = specific_date
        existing.notes = assignment.notes
        existing.status = "scheduled"
        existing.updated_at = ist_now_naive()
    else:
        # Create new
        new_roster = DutyRoster(
            employee_id=assignment.employee_id,
            shift_id=assignment.shift_id,
            week_start_date=week_start,
            day_of_week=assignment.day_of_week,
            specific_date=specific_date,
            notes=assignment.notes,
            status="scheduled",
            assigned_by_id=current_user.id
        )
        db.add(new_roster)
    
    db.commit()
    return {"message": "Shift assigned successfully"}

@router.post("/roster/assign-bulk")
def assign_shift_bulk(
    assignment: RosterBulkAssignment,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Bulk assign shift to multiple employees"""
    if current_user.role != "superadmin":
        shift = db.query(Shift).filter(Shift.id == assignment.shift_id).first()
        if shift is None or int(shift.organization_id) != int(current_user.organization_id):
            raise HTTPException(status_code=404, detail="Shift not found")
    week_start = datetime.strptime(assignment.week_start_date, "%Y-%m-%d")
    assigned_count = 0
    
    for employee_id in assignment.employee_ids:
        if current_user.role != "superadmin":
            _bulk_emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
            assert_company_allowed(db, current_user, _bulk_emp.company_id)
        for day in assignment.days:
            # Check existing
            existing = db.query(DutyRoster).filter(
                DutyRoster.employee_id == employee_id,
                DutyRoster.week_start_date == week_start,
                DutyRoster.day_of_week == day
            ).first()
            
            if existing:
                existing.shift_id = assignment.shift_id
                existing.status = "scheduled"
                existing.notes = assignment.notes
            else:
                new_roster = DutyRoster(
                    employee_id=employee_id,
                    shift_id=assignment.shift_id,
                    week_start_date=week_start,
                    day_of_week=day,
                    notes=assignment.notes,
                    status="scheduled",
                    assigned_by_id=current_user.id
                )
                db.add(new_roster)
            assigned_count += 1
    
    db.commit()
    return {"message": f"Shift assigned to {assigned_count} slots successfully"}

@router.delete("/roster/{roster_id}")
def remove_roster_assignment(
    roster_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove a roster assignment"""
    roster = db.query(DutyRoster).filter(DutyRoster.id == roster_id).first()
    if not roster:
        raise HTTPException(status_code=404, detail="Roster entry not found")
    
    if current_user.role != "superadmin":
        _rm_emp = get_employee_in_org(db, Employee, roster.employee_id, current_user.organization_id)
        assert_company_allowed(db, current_user, _rm_emp.company_id)
    db.delete(roster)
    db.commit()
    return {"message": "Roster assignment removed"}

@router.get("/roster/employee/{employee_id}")
def get_employee_roster_history(
    employee_id: int,
    start_date: str,
    end_date: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get roster history for a specific employee"""
    if current_user.role != "superadmin":
        _hist_emp = get_employee_in_org(db, Employee, employee_id, current_user.organization_id)
        assert_company_allowed(db, current_user, _hist_emp.company_id)
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    
    roster = db.query(DutyRoster).filter(
        DutyRoster.employee_id == employee_id,
        DutyRoster.week_start_date >= start,
        DutyRoster.week_start_date <= end
    ).options(joinedload(DutyRoster.shift)).all()
    
    return roster

# ============ Default Shifts Seeding ============

@router.post("/seed-defaults")
def seed_default_shifts(
    organization_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Seed default shift templates for an organization"""
    from services.workday_service import resolve_workdays
    org_id = organization_id if current_user.role == "superadmin" else current_user.organization_id
    org_workdays = resolve_workdays(db, organization_id=org_id)
    wd_str = ",".join(str(d) for d in org_workdays)
    default_shifts = [
        {
            "name": "Morning Shift",
            "code": "MORNING",
            "shift_type": "morning",
            "start_time": "09:00",
            "end_time": "17:00",
            "grace_minutes": 15,
            "break_duration": 60,
            "working_days": wd_str,
            "color": "#3B82F6",  # Blue
            "description": "Standard morning shift (9 AM - 5 PM)"
        },
        {
            "name": "Evening Shift",
            "code": "EVENING",
            "shift_type": "evening",
            "start_time": "14:00",
            "end_time": "22:00",
            "grace_minutes": 15,
            "break_duration": 60,
            "working_days": wd_str,
            "color": "#F97316",  # Orange
            "description": "Evening shift (2 PM - 10 PM)"
        },
        {
            "name": "Night Shift",
            "code": "NIGHT",
            "shift_type": "night",
            "start_time": "22:00",
            "end_time": "06:00",
            "grace_minutes": 15,
            "break_duration": 60,
            "working_days": wd_str,
            "color": "#8B5CF6",  # Purple
            "description": "Night shift (10 PM - 6 AM)"
        },
        {
            "name": "General Shift",
            "code": "GENERAL",
            "shift_type": "general",
            "start_time": "08:00",
            "end_time": "16:00",
            "grace_minutes": 15,
            "break_duration": 60,
            "working_days": wd_str,
            "color": "#10B981",  # Green
            "description": "General shift (8 AM - 4 PM)"
        }
    ]
    
    created = 0
    for shift_data in default_shifts:
        existing = db.query(Shift).filter(
            Shift.code == shift_data["code"],
            Shift.organization_id == org_id
        ).first()
        
        if not existing:
            new_shift = Shift(
                **shift_data,
                organization_id=org_id,
                status="active"
            )
            db.add(new_shift)
            created += 1
    
    db.commit()
    return {"message": f"Created {created} default shifts", "created": created}
