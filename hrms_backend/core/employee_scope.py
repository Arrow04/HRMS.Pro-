"""Resolve org scope (company / branch / department) from an employee record."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import Branch, Company, Department, Employee, EmployeeBranchAssignment


def resolve_employee_org_scope(db: Session, employee_id: int) -> Dict[str, Any]:
    emp = db.query(Employee).filter(
        Employee.id == employee_id,
        Employee.deleted_at.is_(None),
    ).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    branch_id = None
    branch_name = None
    primary = (
        db.query(EmployeeBranchAssignment)
        .filter(
            EmployeeBranchAssignment.employee_id == employee_id,
            EmployeeBranchAssignment.status == "active",
            EmployeeBranchAssignment.deleted_at.is_(None),
        )
        .order_by(EmployeeBranchAssignment.is_primary.desc())
        .first()
    )
    if primary:
        branch_id = primary.branch_id
    elif emp.branches:
        branch_id = emp.branches[0].id

    if branch_id:
        br = db.query(Branch).filter(Branch.id == branch_id, Branch.deleted_at.is_(None)).first()
        branch_name = br.name if br else None

    company_name = None
    if emp.company_id:
        co = db.query(Company).filter(Company.id == emp.company_id, Company.deleted_at.is_(None)).first()
        company_name = co.name if co else None

    department_name = None
    if emp.department_id:
        dept = db.query(Department).filter(Department.id == emp.department_id, Department.deleted_at.is_(None)).first()
        department_name = dept.name if dept else None

    return {
        "employeeId": emp.id,
        "employeeName": f"{emp.first_name or ''} {emp.last_name or ''}".strip(),
        "employeeCode": emp.employee_code,
        "organizationId": emp.organization_id,
        "companyId": emp.company_id,
        "companyName": company_name,
        "branchId": branch_id,
        "branchName": branch_name,
        "departmentId": emp.department_id,
        "departmentName": department_name,
    }


def apply_employee_scope(
    db: Session,
    data: Dict[str, Any],
    *,
    employee_id_key: str = "employee_id",
) -> Dict[str, Any]:
    """Fill missing org fields from the employee row (source of truth)."""
    emp_id = data.get(employee_id_key)
    if not emp_id:
        return data
    scope = resolve_employee_org_scope(db, int(emp_id))
    mapping = {
        "organization_id": scope.get("organizationId"),
        "company_id": scope.get("companyId"),
        "department_id": scope.get("departmentId"),
        "branch_id": scope.get("branchId"),
    }
    for key, value in mapping.items():
        if value is not None and not data.get(key):
            data[key] = value
    return data
