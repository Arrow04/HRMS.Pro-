"""Job portal syndication — LinkedIn, Indeed, Naukri.com, and more.

Each portal has its own API contract. This service provides a unified interface
for posting jobs and receiving applications via webhooks.
"""

import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError

logger = logging.getLogger(__name__)

# ── Portal configurations ──
# In production, these keys would be per-organization from DB settings

PORTAL_CONFIGS = {
    "linkedin": {
        "name": "LinkedIn",
        "base_url": "https://api.linkedin.com/v2",
        "requires_oauth": True,
        "webhook_support": True,
    },
    "indeed": {
        "name": "Indeed",
        "base_url": "https://apis.indeed.com",
        "requires_oauth": True,
        "webhook_support": True,
    },
    "naukri": {
        "name": "Naukri.com",
        "base_url": "https://api.naukri.com/v1",
        "requires_oauth": True,
        "webhook_support": True,
    },
}


def get_supported_portals() -> list:
    return [
        {"id": k, "name": v["name"], "webhook_support": v["webhook_support"]}
        for k, v in PORTAL_CONFIGS.items()
    ]


def format_job_for_portal(job: Dict[str, Any], portal: str) -> Dict[str, Any]:
    """Format a job posting according to each portal's schema."""
    common = {
        "title": job.get("title", ""),
        "description": job.get("description", ""),
        "location": job.get("location", ""),
        "employment_type": job.get("employment_type", "full_time"),
        "experience_required": job.get("experience_required", ""),
        "skills": job.get("skills_required", ""),
        "salary_min": job.get("salary_min"),
        "salary_max": job.get("salary_max"),
        "expiry_date": job.get("expiry_date"),
    }

    if portal == "linkedin":
        return {
            **common,
            "format": "linkedin_job_posting",
            "apply_url": job.get("apply_url", ""),
        }
    elif portal == "indeed":
        return {
            **common,
            "format": "indeed_xml",
            "job_reference": job.get("id"),
            "category": job.get("category", ""),
        }
    elif portal == "naukri":
        return {
            **common,
            "format": "naukri_json",
            "education": job.get("education_required", ""),
        }
    return common


def post_job_to_portal(job: Dict[str, Any], portal: str, api_key: Optional[str] = None) -> dict:
    """Post a job opening to an external job portal.

    In production, this would make real HTTP calls with OAuth2 authentication.
    For now, it logs the formatted payload and returns a simulated response.
    """
    payload = format_job_for_portal(job, portal)
    logger.info(f"[{portal.upper()}] Posting job '{job.get('title')}': {json.dumps(payload, indent=2)}")

    # Simulated API call — replace with real HTTP in production
    # The actual API integration requires:
    #   LinkedIn: OAuth2 → POST /jobs with access_token
    #   Indeed:  Publisher API → XML feed
    #   Naukri:  API key → POST /job-posting

    return {
        "status": "posted",
        "portal": portal,
        "job_id": job.get("id"),
        "external_id": f"{portal}_{job.get('id')}_{datetime.utcnow().timestamp()}",
        "posted_at": datetime.utcnow().isoformat(),
        "message": f"Job posted to {PORTAL_CONFIGS.get(portal, {}).get('name', portal)}",
    }


def post_job_to_all_portals(job: Dict[str, Any]) -> list:
    """Syndicate a job opening to all configured portals."""
    results = []
    for portal_id in PORTAL_CONFIGS:
        result = post_job_to_portal(job, portal_id)
        results.append(result)
    return results


def process_webhook(payload: Dict[str, Any], portal: str) -> dict:
    """Process an incoming application webhook from an external portal.

    Webhooks are received when candidates apply via LinkedIn Easy Apply,
    Indeed Apply, or Naukri Quick Apply.

    Expected payload structure (varies by portal):
    {
        "candidate": { "name", "email", "phone", "resume_url", ... },
        "job_external_id": "...",
        "application_date": "...",
        "source": "linkedin|indeed|naukri",
    }
    """
    portal_name = PORTAL_CONFIGS.get(portal, {}).get("name", portal)
    candidate_name = payload.get("candidate", {}).get("name", "Unknown")
    job_ext_id = payload.get("job_external_id", "N/A")

    logger.info(f"[{portal_name}] Application received from {candidate_name} for job {job_ext_id}")

    return {
        "status": "received",
        "portal": portal,
        "candidate_name": candidate_name,
        "job_external_id": job_ext_id,
        "received_at": datetime.utcnow().isoformat(),
    }
