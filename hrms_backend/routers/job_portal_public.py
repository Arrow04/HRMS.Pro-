"""
Public Job Portal Router
Community job board with company profiles, job listings, applications, and community features
"""
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timedelta
import os
import uuid

from database import get_db
from models import (
    JobPortalCompany,
    JobPortalJob,
    JobPortalApplication,
    JobPortalUser,
    JobPortalBlog,
    JobPortalComment,
    JobPortalSavedJob,
    JobPortalReport,
    JobPortalVerification,
    JobPortalScamAlert,
    JobPortalBlacklist,
    JobPortalSkill,
    JobPortalAlert,
)

router = APIRouter(tags=["Job Portal"])


# ============== Schemas ==============

class CompanyRegister(BaseModel):
    name: str
    description: str
    industry: str
    website: Optional[str] = None
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    city: str
    state: str
    country: str = "India"
    pincode: Optional[str] = None
    company_size: Optional[str] = None
    founded_year: Optional[int] = None
    logo_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    headquarters: Optional[str] = None
    gstin: Optional[str] = None
    social_links: dict = {}


class JobPost(BaseModel):
    title: str
    description: str
    responsibilities: Optional[str] = None
    requirements: Optional[str] = None
    benefits: Optional[str] = None
    company_id: int
    posted_by: Optional[int] = None
    department: Optional[str] = None
    role: str
    employment_type: str = "full_time"
    work_mode: str = "on_site"
    experience_min: int = 0
    experience_max: Optional[int] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    education_required: Optional[str] = None
    skills_required: List[str] = []
    location: str
    city: str
    state: str
    country: str = "India"
    application_deadline: Optional[str] = None
    vacancy_count: int = 1


class ApplicationCreate(BaseModel):
    job_id: int
    applicant_id: Optional[int] = None
    cover_letter: Optional[str] = None
    resume_url: Optional[str] = None
    expected_salary: Optional[int] = None
    notice_period: Optional[str] = None
    current_company: Optional[str] = None
    current_designation: Optional[str] = None
    experience_years: Optional[int] = None


class JobSeekerProfile(BaseModel):
    full_name: str
    email: str
    phone: Optional[str] = None
    headline: Optional[str] = None
    summary: Optional[str] = None
    current_designation: Optional[str] = None
    current_company: Optional[str] = None
    location: Optional[str] = None
    city: str
    state: str
    country: str = "India"
    resume_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    expected_salary_min: Optional[int] = None
    expected_salary_max: Optional[int] = None
    current_salary: Optional[int] = None
    notice_period: Optional[str] = None
    employment_type_preference: Optional[str] = None
    remote_preference: Optional[str] = None
    skills: List[str] = []
    experience_years: int = 0
    profile_type: str = "experienced"
    hourly_rate_min: Optional[int] = None
    hourly_rate_max: Optional[int] = None
    availability: Optional[str] = None
    services: List[dict] = []
    languages: List[str] = []
    achievements: List[dict] = []
    education: List[dict] = []
    work_experience: List[dict] = []
    certifications: List[dict] = []
    projects: List[dict] = []
    profile_visibility: str = "public"
    is_open_to_opportunities: bool = True


class BlogPost(BaseModel):
    title: str
    content: str
    excerpt: Optional[str] = None
    category: str
    tags: List[str] = []
    featured_image: Optional[str] = None


class CommentCreate(BaseModel):
    commentable_type: str
    commentable_id: int
    content: str
    parent_id: Optional[int] = None


# ============== Public Endpoints ==============

@router.get("/public/jobs")
def get_public_jobs(
    search: Optional[str] = None,
    location: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    employment_type: Optional[str] = None,
    work_mode: Optional[str] = None,
    experience_min: Optional[int] = None,
    experience_max: Optional[int] = None,
    salary_min: Optional[int] = None,
    salary_max: Optional[int] = None,
    is_remote: Optional[bool] = None,
    is_urgent: Optional[bool] = None,
    company_id: Optional[int] = None,
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(JobPortalJob).filter(
        JobPortalJob.status == "open",
        JobPortalJob.expiry_date >= datetime.now(),
        JobPortalJob.deleted_at == None,
    )

    if search:
        query = query.filter(
            JobPortalJob.title.ilike(f"%{search}%")
            | JobPortalJob.description.ilike(f"%{search}%")
            | JobPortalJob.skills_required.contains([search])
        )
    if location:
        query = query.filter(JobPortalJob.location.ilike(f"%{location}%"))
    if city:
        query = query.filter(JobPortalJob.city.ilike(f"%{city}%"))
    if state:
        query = query.filter(JobPortalJob.state.ilike(f"%{state}%"))
    if employment_type:
        query = query.filter(JobPortalJob.employment_type == employment_type)
    if work_mode:
        query = query.filter(JobPortalJob.work_mode == work_mode)
    if experience_min:
        query = query.filter(JobPortalJob.experience_min >= experience_min)
    if experience_max:
        query = query.filter(JobPortalJob.experience_max <= experience_max)
    if salary_min:
        query = query.filter(JobPortalJob.salary_max >= salary_min)
    if salary_max:
        query = query.filter(JobPortalJob.salary_min <= salary_max)
    if is_remote is not None:
        query = query.filter(JobPortalJob.is_remote == is_remote)
    if is_urgent:
        query = query.filter(JobPortalJob.is_urgent == True)
    if company_id:
        query = query.filter(JobPortalJob.company_id == company_id)

    total = query.count()

    jobs = query.order_by(
        JobPortalJob.is_featured.desc(),
        JobPortalJob.is_urgent.desc(),
        JobPortalJob.published_at.desc(),
    ).offset(offset).limit(limit).all()

    return {
        "jobs": [
            {
                "id": job.id,
                "title": job.title,
                "slug": job.slug,
                "description": job.description[:500],
                "company": {
                    "id": job.company.id,
                    "name": job.company.name,
                    "logo_url": job.company.logo_url,
                    "industry": job.company.industry,
                    "city": job.company.city,
                    "is_verified": job.company.is_verified,
                },
                "department": job.department,
                "role": job.role,
                "employment_type": job.employment_type,
                "work_mode": job.work_mode,
                "experience_min": job.experience_min,
                "experience_max": job.experience_max,
                "salary_min": job.salary_min,
                "salary_max": job.salary_max,
                "salary_currency": job.salary_currency,
                "location": job.location,
                "city": job.city,
                "state": job.state,
                "country": job.country,
                "is_remote": job.is_remote,
                "is_urgent": job.is_urgent,
                "is_featured": job.is_featured,
                "skills_required": job.skills_required,
                "application_count": job.application_count,
                "view_count": job.view_count,
                "published_at": job.published_at.isoformat() if job.published_at else None,
                "application_deadline": job.application_deadline.isoformat() if job.application_deadline else None,
            }
            for job in jobs
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/public/jobs/{job_id}")
def get_public_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(JobPortalJob).filter(
        JobPortalJob.id == job_id,
        JobPortalJob.deleted_at == None,
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job.view_count += 1
    db.commit()

    return {
        "id": job.id,
        "title": job.title,
        "slug": job.slug,
        "description": job.description,
        "responsibilities": job.responsibilities,
        "requirements": job.requirements,
        "benefits": job.benefits,
        "company": {
            "id": job.company.id,
            "name": job.company.name,
            "slug": job.company.slug,
            "logo_url": job.company.logo_url,
            "description": job.company.description,
            "website": job.company.website,
            "industry": job.company.industry,
            "company_size": job.company.company_size,
            "headquarters": job.company.headquarters,
            "city": job.company.city,
            "state": job.company.state,
            "country": job.company.country,
            "is_verified": job.company.is_verified,
            "social_links": job.company.social_links,
        },
        "department": job.department,
        "role": job.role,
        "employment_type": job.employment_type,
        "work_mode": job.work_mode,
        "experience_min": job.experience_min,
        "experience_max": job.experience_max,
        "salary_min": job.salary_min,
        "salary_max": job.salary_max,
        "salary_currency": job.salary_currency,
        "education_required": job.education_required,
        "skills_required": job.skills_required,
        "languages_required": job.languages_required,
        "certifications_required": job.certifications_required,
        "location": job.location,
        "city": job.city,
        "state": job.state,
        "country": job.country,
        "is_remote": job.is_remote,
        "is_urgent": job.is_urgent,
        "is_featured": job.is_featured,
        "vacancy_count": job.vacancy_count,
        "application_count": job.application_count,
        "view_count": job.view_count,
        "published_at": job.published_at.isoformat() if job.published_at else None,
        "application_deadline": job.application_deadline.isoformat() if job.application_deadline else None,
        "tags": job.tags,
    }


@router.get("/public/companies")
def get_public_companies(
    search: Optional[str] = None,
    industry: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(JobPortalCompany).filter(
        JobPortalCompany.status == "active",
        JobPortalCompany.deleted_at == None,
    )

    if search:
        query = query.filter(
            JobPortalCompany.name.ilike(f"%{search}%")
            | JobPortalCompany.description.ilike(f"%{search}%")
        )
    if industry:
        query = query.filter(JobPortalCompany.industry.ilike(f"%{industry}%"))
    if city:
        query = query.filter(JobPortalCompany.city.ilike(f"%{city}%"))
    if state:
        query = query.filter(JobPortalCompany.state.ilike(f"%{state}%"))

    total = query.count()

    companies = query.order_by(
        JobPortalCompany.is_featured.desc(),
        JobPortalCompany.created_at.desc(),
    ).offset(offset).limit(limit).all()

    return {
        "companies": [
            {
                "id": company.id,
                "name": company.name,
                "slug": company.slug,
                "description": (company.description or "")[:300],
                "logo_url": company.logo_url,
                "industry": company.industry,
                "company_size": company.company_size,
                "city": company.city,
                "state": company.state,
                "country": company.country,
                "is_verified": company.is_verified,
                "is_featured": company.is_featured,
                "website": company.website,
                "job_count": len(company.jobs),
            }
            for company in companies
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/public/companies/{company_id}")
def get_public_company(company_id: int, db: Session = Depends(get_db)):
    company = db.query(JobPortalCompany).filter(
        JobPortalCompany.id == company_id,
        JobPortalCompany.deleted_at == None,
    ).first()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return {
        "id": company.id,
        "name": company.name,
        "slug": company.slug,
        "description": company.description,
        "logo_url": company.logo_url,
        "cover_image_url": company.cover_image_url,
        "website": company.website,
        "industry": company.industry,
        "company_size": company.company_size,
        "headquarters": company.headquarters,
        "founded_year": company.founded_year,
        "email": company.email,
        "phone": company.phone,
        "address": company.address,
        "city": company.city,
        "state": company.state,
        "country": company.country,
        "is_verified": company.is_verified,
        "is_featured": company.is_featured,
        "social_links": company.social_links,
        "jobs": [
            {
                "id": job.id,
                "title": job.title,
                "slug": job.slug,
                "employment_type": job.employment_type,
                "location": job.location,
                "is_remote": job.is_remote,
                "published_at": job.published_at.isoformat() if job.published_at else None,
            }
            for job in company.jobs if job.status == "open"
        ][:10],
    }


@router.post("/public/companies/register")
def register_company(company: CompanyRegister, db: Session = Depends(get_db)):
    existing = db.query(JobPortalCompany).filter(
        JobPortalCompany.email == company.email,
        JobPortalCompany.deleted_at == None,
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Company already registered with this email")

    slug = company.name.lower().replace(" ", "-").replace(".", "")
    existing_slug = db.query(JobPortalCompany).filter(JobPortalCompany.slug == slug).first()
    if existing_slug:
        slug = f"{slug}-{datetime.utcnow().timestamp()}"

    new_company = JobPortalCompany(
        name=company.name,
        slug=slug,
        description=company.description,
        industry=company.industry,
        website=company.website,
        email=company.email,
        phone=company.phone,
        address=company.address,
        city=company.city,
        state=company.state,
        country=company.country,
        pincode=company.pincode,
        company_size=company.company_size,
        founded_year=company.founded_year,
        logo_url=company.logo_url,
        cover_image_url=company.cover_image_url,
        headquarters=company.headquarters,
        gstin=company.gstin,
        social_links=company.social_links or {},
        status="active",
    )

    db.add(new_company)
    db.commit()
    db.refresh(new_company)

    return {
        "id": new_company.id,
        "name": new_company.name,
        "slug": new_company.slug,
        "status": new_company.status,
        "message": "Company registered successfully. You can now post jobs.",
    }


@router.post("/public/jobs/post")
def post_job(job: JobPost, db: Session = Depends(get_db)):
    company = db.query(JobPortalCompany).filter(
        JobPortalCompany.id == job.company_id,
        JobPortalCompany.deleted_at == None,
    ).first()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    slug = f"{job.title.lower().replace(' ', '-')}-{datetime.utcnow().timestamp()}"
    expiry_date = datetime.utcnow() + timedelta(days=30)

    new_job = JobPortalJob(
        title=job.title,
        slug=slug,
        description=job.description,
        responsibilities=job.responsibilities,
        requirements=job.requirements,
        benefits=job.benefits,
        company_id=job.company_id,
        posted_by=job.posted_by,
        department=job.department,
        role=job.role,
        employment_type=job.employment_type,
        work_mode=job.work_mode,
        experience_min=job.experience_min,
        experience_max=job.experience_max,
        salary_min=job.salary_min,
        salary_max=job.salary_max,
        education_required=job.education_required,
        skills_required=job.skills_required,
        location=job.location,
        city=job.city,
        state=job.state,
        country=job.country,
        application_deadline=datetime.fromisoformat(job.application_deadline) if job.application_deadline else None,
        expiry_date=expiry_date,
        published_at=datetime.utcnow(),
        status="open",
    )

    db.add(new_job)
    db.commit()
    db.refresh(new_job)

    return {
        "id": new_job.id,
        "title": new_job.title,
        "slug": new_job.slug,
        "status": new_job.status,
        "published_at": new_job.published_at.isoformat(),
        "message": "Job posted successfully",
    }


@router.post("/public/applications")
def apply_for_job(application: ApplicationCreate, db: Session = Depends(get_db)):
    job = db.query(JobPortalJob).filter(
        JobPortalJob.id == application.job_id,
        JobPortalJob.status == "open",
        JobPortalJob.deleted_at == None,
    ).first()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found or closed")

    existing = None
    if application.applicant_id is not None:
        existing = db.query(JobPortalApplication).filter(
            JobPortalApplication.job_id == application.job_id,
            JobPortalApplication.applicant_id == application.applicant_id,
            JobPortalApplication.deleted_at == None,
        ).first()

    if existing:
        raise HTTPException(status_code=400, detail="You have already applied for this job")

    if application.applicant_id is None:
        # Anonymous/community apply: link to a lightweight guest profile via email when possible.
        # v1 keeps it simple — applicant_id stays null and the application is still recorded.
        pass

    new_application = JobPortalApplication(
        job_id=application.job_id,
        applicant_id=application.applicant_id,
        cover_letter=application.cover_letter,
        resume_url=application.resume_url,
        expected_salary=application.expected_salary,
        notice_period=application.notice_period,
        current_company=application.current_company,
        current_designation=application.current_designation,
        experience_years=application.experience_years,
        status="applied",
    )

    job.application_count += 1
    db.add(new_application)
    db.commit()
    db.refresh(new_application)

    return {
        "id": new_application.id,
        "job_id": new_application.job_id,
        "status": new_application.status,
        "applied_at": new_application.applied_at.isoformat(),
        "message": "Application submitted successfully",
    }


@router.get("/public/applications/my")
def get_my_applications(user_id: int, db: Session = Depends(get_db)):
    applications = db.query(JobPortalApplication).filter(
        JobPortalApplication.applicant_id == user_id,
        JobPortalApplication.deleted_at == None,
    ).order_by(JobPortalApplication.applied_at.desc()).all()

    return {
        "applications": [
            {
                "id": app.id,
                "job": {
                    "id": app.job.id,
                    "title": app.job.title,
                    "company": app.job.company.name,
                    "location": app.job.location,
                    "employment_type": app.job.employment_type,
                },
                "status": app.status,
                "applied_at": app.applied_at.isoformat(),
                "shortlisted_at": app.shortlisted_at.isoformat() if app.shortlisted_at else None,
                "rejected_at": app.rejected_at.isoformat() if app.rejected_at else None,
                "hired_at": app.hired_at.isoformat() if app.hired_at else None,
                "feedback": app.feedback,
            }
            for app in applications
        ]
    }


@router.post("/public/profile")
def create_or_update_profile(profile: JobSeekerProfile, db: Session = Depends(get_db)):
    user = db.query(JobPortalUser).filter(
        JobPortalUser.email == profile.email,
        JobPortalUser.deleted_at == None,
    ).first()

    payload = profile.model_dump() if hasattr(profile, "model_dump") else profile.dict()
    if user:
        for key, value in payload.items():
            setattr(user, key, value)
        user.updated_at = datetime.utcnow()
    else:
        user = JobPortalUser(**payload)
        db.add(user)

    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "headline": user.headline,
        "location": user.location,
        "skills": user.skills,
        "experience_years": user.experience_years,
        "profile_type": getattr(user, "profile_type", "experienced"),
        "message": "Profile saved successfully",
    }


@router.get("/public/profile/{user_id}")
def get_public_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.query(JobPortalUser).filter(
        JobPortalUser.id == user_id,
        JobPortalUser.deleted_at == None,
        JobPortalUser.profile_visibility == "public",
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="Profile not found")

    return {
        "id": user.id,
        "full_name": user.full_name,
        "profile_picture": user.profile_picture,
        "headline": user.headline,
        "summary": user.summary,
        "current_designation": user.current_designation,
        "current_company": user.current_company,
        "location": user.location,
        "city": user.city,
        "state": user.state,
        "country": user.country,
        "resume_url": user.resume_url,
        "portfolio_url": user.portfolio_url,
        "linkedin_url": user.linkedin_url,
        "github_url": user.github_url,
        "skills": user.skills,
        "experience_years": user.experience_years,
        "education": user.education,
        "work_experience": user.work_experience,
        "certifications": user.certifications,
        "projects": user.projects,
        "is_verified": user.is_verified,
        "is_featured": user.is_featured,
    }


@router.post("/public/jobs/save")
def save_job(job_id: int, user_id: int, db: Session = Depends(get_db)):
    existing = db.query(JobPortalSavedJob).filter(
        JobPortalSavedJob.job_id == job_id,
        JobPortalSavedJob.user_id == user_id,
        JobPortalSavedJob.deleted_at == None,
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Job already saved")

    saved = JobPortalSavedJob(job_id=job_id, user_id=user_id)
    db.add(saved)

    job = db.query(JobPortalJob).filter(JobPortalJob.id == job_id).first()
    if job:
        job.save_count += 1

    db.commit()
    return {"message": "Job saved successfully"}


@router.get("/public/blogs")
def get_blogs(
    category: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(20, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(JobPortalBlog).filter(
        JobPortalBlog.is_published == True,
        JobPortalBlog.deleted_at == None,
    )

    if category:
        query = query.filter(JobPortalBlog.category == category)
    if search:
        query = query.filter(
            JobPortalBlog.title.ilike(f"%{search}%")
            | JobPortalBlog.content.ilike(f"%{search}%")
        )

    blogs = query.order_by(
        JobPortalBlog.is_featured.desc(),
        JobPortalBlog.published_at.desc(),
    ).offset(offset).limit(limit).all()

    return {
        "blogs": [
            {
                "id": blog.id,
                "title": blog.title,
                "slug": blog.slug,
                "excerpt": blog.excerpt or blog.content[:200],
                "featured_image": blog.featured_image,
                "author_name": blog.author_name,
                "category": blog.category,
                "tags": blog.tags,
                "view_count": blog.view_count,
                "like_count": blog.like_count,
                "comment_count": blog.comment_count,
                "is_featured": blog.is_featured,
                "published_at": blog.published_at.isoformat() if blog.published_at else None,
            }
            for blog in blogs
        ]
    }


@router.post("/public/blogs")
def create_blog(blog: BlogPost, user_id: int, db: Session = Depends(get_db)):
    slug = blog.title.lower().replace(" ", "-").replace(".", "")
    existing_slug = db.query(JobPortalBlog).filter(JobPortalBlog.slug == slug).first()
    if existing_slug:
        slug = f"{slug}-{datetime.utcnow().timestamp()}"

    new_blog = JobPortalBlog(
        title=blog.title,
        slug=slug,
        content=blog.content,
        excerpt=blog.excerpt or blog.content[:300],
        category=blog.category,
        tags=blog.tags,
        featured_image=blog.featured_image,
        author_id=user_id,
        author_name="User",
        is_published=True,
        published_at=datetime.utcnow(),
    )

    db.add(new_blog)
    db.commit()
    db.refresh(new_blog)

    return {
        "id": new_blog.id,
        "title": new_blog.title,
        "slug": new_blog.slug,
        "message": "Blog post published successfully",
    }


@router.get("/public/blogs/{blog_id}")
def get_blog(blog_id: int, db: Session = Depends(get_db)):
    blog = db.query(JobPortalBlog).filter(
        JobPortalBlog.id == blog_id,
        JobPortalBlog.is_published == True,
        JobPortalBlog.deleted_at == None,
    ).first()

    if not blog:
        raise HTTPException(status_code=404, detail="Blog not found")

    blog.view_count += 1
    db.commit()

    return {
        "id": blog.id,
        "title": blog.title,
        "slug": blog.slug,
        "content": blog.content,
        "excerpt": blog.excerpt,
        "featured_image": blog.featured_image,
        "author_name": blog.author_name,
        "category": blog.category,
        "tags": blog.tags,
        "view_count": blog.view_count,
        "like_count": blog.like_count,
        "comment_count": blog.comment_count,
        "published_at": blog.published_at.isoformat() if blog.published_at else None,
    }


@router.post("/public/comments")
def create_comment(comment: CommentCreate, user_id: int, db: Session = Depends(get_db)):
    new_comment = JobPortalComment(
        commentable_type=comment.commentable_type,
        commentable_id=comment.commentable_id,
        user_id=user_id,
        user_name="User",
        content=comment.content,
        parent_id=comment.parent_id,
        is_approved=True,
    )

    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)

    return {
        "id": new_comment.id,
        "content": new_comment.content,
        "created_at": new_comment.created_at.isoformat(),
        "message": "Comment posted successfully",
    }


@router.get("/public/comments/{commentable_type}/{commentable_id}")
def get_comments(commentable_type: str, commentable_id: int, db: Session = Depends(get_db)):
    comments = db.query(JobPortalComment).filter(
        JobPortalComment.commentable_type == commentable_type,
        JobPortalComment.commentable_id == commentable_id,
        JobPortalComment.is_approved == True,
        JobPortalComment.deleted_at == None,
        JobPortalComment.parent_id == None,
    ).order_by(JobPortalComment.created_at.desc()).all()

    return {
        "comments": [
            {
                "id": comment.id,
                "user_name": comment.user_name,
                "content": comment.content,
                "like_count": comment.like_count,
                "created_at": comment.created_at.isoformat(),
            }
            for comment in comments
        ]
    }


@router.get("/public/skills")
def get_skills(search: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(JobPortalSkill).filter(JobPortalSkill.is_active == True)

    if search:
        query = query.filter(JobPortalSkill.name.ilike(f"%{search}%"))

    skills = query.order_by(JobPortalSkill.name).limit(100).all()

    return {
        "skills": [
            {
                "id": skill.id,
                "name": skill.name,
                "category": skill.category,
                "description": skill.description,
            }
            for skill in skills
        ]
    }


@router.get("/public/stats")
def get_portal_stats(db: Session = Depends(get_db)):
    total_jobs = db.query(JobPortalJob).filter(
        JobPortalJob.status == "open",
        JobPortalJob.deleted_at == None,
    ).count()

    total_companies = db.query(JobPortalCompany).filter(
        JobPortalCompany.status == "active",
        JobPortalCompany.deleted_at == None,
    ).count()

    total_applications = db.query(JobPortalApplication).filter(
        JobPortalApplication.deleted_at == None,
    ).count()

    total_job_seekers = db.query(JobPortalUser).filter(
        JobPortalUser.deleted_at == None,
    ).count()

    return {
        "total_jobs": total_jobs,
        "total_companies": total_companies,
        "total_applications": total_applications,
        "total_job_seekers": total_job_seekers,
        "jobs_by_type": {},
        "jobs_by_city": {},
    }


# ============== Trust & Safety ==============

class ReportCreate(BaseModel):
    reporter_name: str
    reporter_email: str
    reportable_type: str
    reportable_id: int
    reason: str
    description: str
    evidence_url: Optional[str] = None


@router.post("/public/reports")
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    new_report = JobPortalReport(
        reporter_name=report.reporter_name,
        reporter_email=report.reporter_email,
        reportable_type=report.reportable_type,
        reportable_id=report.reportable_id,
        reason=report.reason,
        description=report.description,
        evidence_url=report.evidence_url,
        status="pending",
    )

    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    return {
        "id": new_report.id,
        "status": new_report.status,
        "message": "Report submitted successfully. Our team will review it within 24 hours.",
    }


@router.get("/public/scam-alerts")
def get_scam_alerts(db: Session = Depends(get_db)):
    alerts = db.query(JobPortalScamAlert).filter(
        JobPortalScamAlert.is_active == True,
        JobPortalScamAlert.deleted_at == None,
    ).order_by(JobPortalScamAlert.created_at.desc()).limit(50).all()

    return {
        "alerts": [
            {
                "id": alert.id,
                "title": alert.title,
                "description": alert.description,
                "alert_type": alert.alert_type,
                "company_name": alert.company_name,
                "website": alert.website,
                "email": alert.email,
                "phone": alert.phone,
                "is_verified": alert.is_verified,
                "created_at": alert.created_at.isoformat(),
            }
            for alert in alerts
        ]
    }


@router.get("/public/verify-company/{company_id}")
def verify_company(company_id: int, db: Session = Depends(get_db)):
    company = db.query(JobPortalCompany).filter(
        JobPortalCompany.id == company_id,
        JobPortalCompany.deleted_at == None,
    ).first()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    verifications = db.query(JobPortalVerification).filter(
        JobPortalVerification.company_id == company_id,
        JobPortalVerification.deleted_at == None,
    ).all()

    return {
        "company_id": company.id,
        "company_name": company.name,
        "is_verified": company.is_verified,
        "is_featured": company.is_featured,
        "verifications": [
            {
                "id": v.id,
                "verification_type": v.verification_type,
                "status": v.status,
                "document_type": v.document_type,
                "verified_at": v.verified_at.isoformat() if v.verified_at else None,
            }
            for v in verifications
        ],
    }


@router.post("/public/check-blacklist")
def check_blacklist(
    email: Optional[str] = None,
    phone: Optional[str] = None,
    company_name: Optional[str] = None,
    db: Session = Depends(get_db),
):
    results = []

    if email:
        entries = db.query(JobPortalBlacklist).filter(
            JobPortalBlacklist.entity_email == email,
            JobPortalBlacklist.deleted_at == None,
        ).all()
        results.extend(entries)

    if phone:
        entries = db.query(JobPortalBlacklist).filter(
            JobPortalBlacklist.entity_phone == phone,
            JobPortalBlacklist.deleted_at == None,
        ).all()
        results.extend([e for e in entries if e not in results])

    if company_name:
        entries = db.query(JobPortalBlacklist).filter(
            JobPortalBlacklist.entity_name.ilike(f"%{company_name}%"),
            JobPortalBlacklist.deleted_at == None,
        ).all()
        results.extend([e for e in entries if e not in results])

    return {
        "is_blacklisted": len(results) > 0,
        "entries": [
            {
                "id": entry.id,
                "entity_type": entry.entity_type,
                "entity_name": entry.entity_name,
                "reason": entry.reason,
                "description": entry.description,
                "created_at": entry.created_at.isoformat(),
            }
            for entry in results
        ],
    }


@router.post("/public/verify-user")
def verify_user(user_id: int, verification_type: str, db: Session = Depends(get_db)):
    user = db.query(JobPortalUser).filter(
        JobPortalUser.id == user_id,
        JobPortalUser.deleted_at == None,
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    verification = JobPortalVerification(
        user_id=user_id,
        verification_type=verification_type,
        status="pending",
    )

    db.add(verification)
    db.commit()
    db.refresh(verification)

    return {
        "id": verification.id,
        "status": verification.status,
        "message": "Verification request submitted. Our team will review your documents.",
    }

# ============== Saved-search Alerts ==============

class AlertCreate(BaseModel):
    email: str
    search: Optional[str] = None
    location: Optional[str] = None
    remote_only: bool = False


def _open_jobs_query(db: Session):
    return db.query(JobPortalJob).filter(
        JobPortalJob.status == "open",
        JobPortalJob.expiry_date >= datetime.now(),
        JobPortalJob.deleted_at == None,
    )


@router.post("/public/alerts")
def create_alert(alert: AlertCreate, db: Session = Depends(get_db)):
    if "@" not in (alert.email or ""):
        raise HTTPException(status_code=400, detail="Valid email required")
    existing = db.query(JobPortalAlert).filter(
        JobPortalAlert.email == alert.email.strip().lower(),
        JobPortalAlert.search == (alert.search or None),
        JobPortalAlert.location == (alert.location or None),
        JobPortalAlert.is_active == True,
    ).first()
    if existing:
        return {"id": existing.id, "message": "Alert already active for this search"}
    new_alert = JobPortalAlert(
        email=alert.email.strip().lower(),
        search=alert.search.strip() if alert.search else None,
        location=alert.location.strip() if alert.location else None,
        remote_only=alert.remote_only,
        is_active=True,
    )
    db.add(new_alert)
    db.commit()
    db.refresh(new_alert)
    return {"id": new_alert.id, "message": "Job alert created. We will highlight new matches here."}


@router.get("/public/alerts")
def list_alerts(email: str, db: Session = Depends(get_db)):
    alerts = db.query(JobPortalAlert).filter(
        JobPortalAlert.email == email.strip().lower(),
        JobPortalAlert.is_active == True,
    ).order_by(JobPortalAlert.created_at.desc()).all()
    return {
        "alerts": [
            {
                "id": a.id,
                "search": a.search,
                "location": a.location,
                "remote_only": a.remote_only,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in alerts
        ]
    }


@router.delete("/public/alerts/{alert_id}")
def delete_alert(alert_id: int, email: str, db: Session = Depends(get_db)):
    alert = db.query(JobPortalAlert).filter(
        JobPortalAlert.id == alert_id,
        JobPortalAlert.email == email.strip().lower(),
        JobPortalAlert.is_active == True,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_active = False
    db.commit()
    return {"message": "Alert removed"}


@router.get("/public/alerts/{alert_id}/matches")
def alert_matches(alert_id: int, email: str, limit: int = Query(20, le=50), db: Session = Depends(get_db)):
    alert = db.query(JobPortalAlert).filter(
        JobPortalAlert.id == alert_id,
        JobPortalAlert.email == email.strip().lower(),
        JobPortalAlert.is_active == True,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    query = _open_jobs_query(db)
    if alert.search:
        query = query.filter(
            JobPortalJob.title.ilike(f"%{alert.search}%")
            | JobPortalJob.description.ilike(f"%{alert.search}%")
        )
    if alert.location:
        query = query.filter(JobPortalJob.location.ilike(f"%{alert.location}%"))
    if alert.remote_only:
        query = query.filter(JobPortalJob.is_remote == True)
    jobs = query.order_by(JobPortalJob.published_at.desc()).limit(limit).all()
    return {
        "alert_id": alert.id,
        "jobs": [
            {
                "id": j.id,
                "title": j.title,
                "company": {"id": j.company.id, "name": j.company.name, "is_verified": j.company.is_verified} if j.company else None,
                "location": j.location,
                "city": j.city,
                "employment_type": j.employment_type,
                "is_remote": j.is_remote,
                "published_at": j.published_at.isoformat() if j.published_at else None,
            }
            for j in jobs
        ],
    }

# ============== Public File Uploads ==============
# Files land under routers/uploads/portal/<kind>/ and are served publicly
# (main.py marks the /portal/ prefix as a public upload path).

_UPLOAD_RULES = {
    "resume": ((".pdf", ".doc", ".docx", ".txt"), 5 * 1024 * 1024),
    "avatar": ((".png", ".jpg", ".jpeg", ".webp"), 2 * 1024 * 1024),
    "logo": ((".png", ".jpg", ".jpeg", ".webp"), 2 * 1024 * 1024),
    "cover": ((".png", ".jpg", ".jpeg", ".webp"), 3 * 1024 * 1024),
}


@router.post("/public/uploads")
async def upload_portal_file(kind: str = Query("resume"), file: UploadFile = File(...)):
    if kind not in _UPLOAD_RULES:
        raise HTTPException(status_code=400, detail="Invalid upload kind")
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    allowed_exts, max_bytes = _UPLOAD_RULES[kind]
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {' ,'.join(allowed_exts)}".replace(" ,", ","),
        )
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File too large. Max {max_bytes // (1024 * 1024)} MB.")
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    filename = f"{kind}_{uuid.uuid4().hex[:12]}{ext}"
    upload_dir = os.path.join(os.path.dirname(__file__), "uploads", "portal", kind)
    os.makedirs(upload_dir, exist_ok=True)
    with open(os.path.join(upload_dir, filename), "wb") as f:
        f.write(content)
    return {"url": f"/uploads/portal/{kind}/{filename}", "kind": kind}

# ============== Public Talent Directory ==============

@router.get("/public/profiles")
def list_public_profiles(
    search: Optional[str] = None,
    profile_type: Optional[str] = None,
    city: Optional[str] = None,
    limit: int = Query(20, le=50),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(JobPortalUser).filter(
        JobPortalUser.deleted_at == None,
        JobPortalUser.profile_visibility == "public",
    )
    if search:
        query = query.filter(
            JobPortalUser.full_name.ilike(f"%{search}%")
            | JobPortalUser.headline.ilike(f"%{search}%")
        )
    if profile_type:
        query = query.filter(JobPortalUser.profile_type == profile_type)
    if city:
        query = query.filter(JobPortalUser.city.ilike(f"%{city}%"))
    total = query.count()
    users = query.order_by(JobPortalUser.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "profiles": [
            {
                "id": u.id,
                "full_name": u.full_name,
                "profile_picture": u.profile_picture,
                "headline": u.headline,
                "city": u.city,
                "state": u.state,
                "profile_type": getattr(u, "profile_type", "experienced") or "experienced",
                "skills": (u.skills or [])[:6],
                "experience_years": u.experience_years or 0,
                "is_verified": u.is_verified,
            }
            for u in users
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
