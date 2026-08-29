"""Tenant-scoping helpers for multi-tenant isolation.

The system is a multi-tenant HRMS: each paying customer is one Organization,
one admin per org (provisioned via the hub), and every module is scoped to the
caller's organization (and, where relevant, company). These helpers centralize
the org/company ownership checks so routers never rely on raw-ID lookups alone.
"""

from typing import Optional

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session


def get_header_company_id(request: Request) -> Optional[int]:
    """FastAPI dependency that returns the company_id from the X-Company-Id header.

    Returns None when the header is absent or set to an invalid value, which
    signals "no company filter" (show all companies the user has access to).
    """
    return getattr(request.state, "company_id_header", None)


def org_owned(record, org_id: int) -> None:
    """Raise 404 unless the record exists and belongs to the caller's org.

    Use after loading a record by primary key when the model has an
    organization_id column (the global ORM read-scope listener is defense in
    depth, not a substitute for an explicit check, and object writes are NOT
    auto-scoped).
    """
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    rec_org = getattr(record, "organization_id", None)
    if rec_org is not None and int(rec_org) != int(org_id):
        raise HTTPException(status_code=404, detail="Record not found")


def org_matches(record, org_id: int) -> bool:
    """Boolean form of org_owned (safe for objects without an org column)."""
    if record is None:
        return False
    rec_org = getattr(record, "organization_id", None)
    if rec_org is None:
        return True  # no org column on this record — caller must scope differently
    return int(rec_org) == int(org_id)


def get_employee_in_org(db: Session, employee_model, employee_id, org_id: int):
    """Load an Employee by id guaranteeing it belongs to the caller's org."""
    emp = db.query(employee_model).filter(employee_model.id == employee_id).first()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    if getattr(emp, "organization_id", None) is not None and int(emp.organization_id) != int(org_id):
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


def validate_company_in_org(db: Session, company_model, company_id, org_id: int):
    """Validate a company id belongs to the caller's org (or is unset)."""
    if company_id in (None, "", 0):
        return None
    comp = db.query(company_model).filter(company_model.id == int(company_id)).first()
    if comp is None:
        raise HTTPException(status_code=404, detail="Company not found")
    if getattr(comp, "organization_id", None) is not None and int(comp.organization_id) != int(org_id):
        raise HTTPException(status_code=404, detail="Company not found")
    return comp


def force_org(payload_org, current_org) -> int:
    """Never trust a client-supplied org id; always use the caller's org."""
    return int(current_org)