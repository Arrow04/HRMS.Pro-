"""Reusable employee list scope filters (company / branch / department)."""
from __future__ import annotations

from sqlalchemy import and_, or_
from sqlalchemy.orm import Query, Session

from models import Branch, Department, Employee, EmployeeBranchAssignment, employee_branches


def _employee_ids_with_any_branch(db: Session):
    assigned = db.query(EmployeeBranchAssignment.employee_id).filter(
        EmployeeBranchAssignment.deleted_at.is_(None),
    )
    m2m = db.query(employee_branches.c.employee_id)
    return assigned.union(m2m)


def apply_picker_scope_filters(
    query: Query,
    db: Session,
    *,
    company_id: int | None = None,
    branch_id: int | None = None,
    department_id: int | None = None,
) -> Query:
    """
    Narrow employees for picker dropdowns.

    Branch/department filters are inclusive for incomplete profiles:
    employees with no branch assignment still appear under any branch of their company;
    employees with no department still appear under any department of their company.
    """
    if company_id:
        query = query.filter(Employee.company_id == company_id)

    if branch_id:
        branch = (
            db.query(Branch)
            .filter(Branch.id == branch_id, Branch.deleted_at.is_(None))
            .first()
        )
        assigned = db.query(EmployeeBranchAssignment.employee_id).filter(
            EmployeeBranchAssignment.branch_id == branch_id,
            EmployeeBranchAssignment.deleted_at.is_(None),
        )
        m2m = db.query(employee_branches.c.employee_id).filter(
            employee_branches.c.branch_id == branch_id
        )
        branch_match = or_(Employee.id.in_(assigned), Employee.id.in_(m2m))
        if branch and branch.company_id:
            branch_match = or_(
                branch_match,
                and_(
                    Employee.company_id == branch.company_id,
                    ~Employee.id.in_(_employee_ids_with_any_branch(db)),
                ),
            )
        query = query.filter(branch_match)

    if department_id:
        dept = (
            db.query(Department)
            .filter(Department.id == department_id, Department.deleted_at.is_(None))
            .first()
        )
        dept_match = Employee.department_id == department_id
        if dept and dept.company_id:
            dept_match = or_(
                Employee.department_id == department_id,
                and_(
                    Employee.department_id.is_(None),
                    Employee.company_id == dept.company_id,
                ),
            )
        query = query.filter(dept_match)

    return query
