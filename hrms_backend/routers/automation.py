"""Automation routes: backups, holiday sync, job scheduler."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from core.auth import get_current_user
from models import User, Holiday

router = APIRouter(tags=["Automation"])


@router.get("/api/backups")
def list_backups(current_user: User = Depends(get_current_user)):
    from services.backup_service import list_backups
    return list_backups()


@router.post("/api/backups")
def create_backup(current_user: User = Depends(get_current_user)):
    from services.backup_service import create_backup, run_retention_policy
    result = create_backup()
    retention = run_retention_policy()
    return {**result, "retention": retention}


@router.post("/api/backups/retention")
def run_retention(current_user: User = Depends(get_current_user)):
    from services.backup_service import run_retention_policy
    return run_retention_policy()


@router.post("/api/holidays/{holiday_id}/sync")
def sync_holiday_to_attendance_endpoint(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.holiday_sync_service import sync_holiday_to_attendance
    holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return sync_holiday_to_attendance(db, holiday)


@router.post("/api/automation/sync-holidays")
def sync_all_holidays_for_month_endpoint(
    month: int, year: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.holiday_sync_service import sync_all_holidays_for_month
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization required")
    return sync_all_holidays_for_month(db, org_id, year, month)


@router.get("/api/automation/jobs")
def get_automation_jobs():
    from services.job_scheduler import get_available_jobs
    return get_available_jobs()


@router.post("/api/automation/run/{job_id}")
def run_automation_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.job_scheduler import run_job
    org_id = current_user.organization_id
    return run_job(db, job_id, org_id)


@router.post("/api/automation/run-all")
def run_all_automation_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.job_scheduler import run_all_jobs
    org_id = current_user.organization_id
    return run_all_jobs(db, org_id)
