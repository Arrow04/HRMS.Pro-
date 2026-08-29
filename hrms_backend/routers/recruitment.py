"""Recruitment pipeline and job portal syndication routes."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from core.auth import get_current_user
from models import User, Candidate, JobOpening, Company

router = APIRouter(tags=["Recruitment"])


@router.post("/api/recruitment/candidates/{candidate_id}/transition")
def transition_candidate_status_endpoint(
    candidate_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.recruitment_pipeline import transition_candidate_status
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    if current_user.role != "superadmin":
        in_org = False
        if candidate.company_id:
            comp = db.query(Company).filter(Company.id == candidate.company_id).first()
            if comp and comp.organization_id == current_user.organization_id:
                in_org = True
        if not in_org and candidate.job_opening_id:
            job = db.query(JobOpening).filter(JobOpening.id == candidate.job_opening_id).first()
            if job and job.organization_id == current_user.organization_id:
                in_org = True
        if not in_org:
            raise HTTPException(status_code=404, detail="Candidate not found")
    new_status = payload.get("status")
    if not new_status:
        raise HTTPException(status_code=400, detail="status is required")
    return transition_candidate_status(db, candidate, new_status)


@router.get("/api/job-portals")
def get_job_portals():
    from services.job_portal_service import get_supported_portals
    return get_supported_portals()


@router.post("/api/jobs/{job_id}/post")
def post_job_to_portal(
    job_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from services.job_portal_service import post_job_to_portal, post_job_to_all_portals
    job = db.query(JobOpening).filter(JobOpening.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if current_user.role != "superadmin" and job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Job not found")
    portal = payload.get("portal")
    if portal:
        return post_job_to_portal({"id": job.id, "title": job.title, "description": job.description,
                                    "location": job.location, "employment_type": job.employment_type,
                                    "experience_required": job.experience_required, "skills_required": job.skills_required,
                                    "salary_min": job.salary_min, "salary_max": job.salary_max,
                                    "expiry_date": str(job.expiry_date) if job.expiry_date else None}, portal)
    return post_job_to_all_portals({"id": job.id, "title": job.title, "description": job.description,
                                    "location": job.location, "employment_type": job.employment_type})


@router.post("/api/job-portals/webhook/{portal}")
def job_portal_webhook(portal: str, payload: dict, db: Session = Depends(get_db)):
    from services.job_portal_service import process_webhook
    return process_webhook(payload, portal)
