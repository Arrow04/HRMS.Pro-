"""Maker-checker + calculation snapshot regressions.

Locks in the "money never moves on one click" mandate:
  - generation stamps the MAKER (submitted_by) and an immutable
    calculation_snapshot on every payslip
  - the submitter can never approve their own payroll (403 / blocked)
  - a second user CAN approve
  - company-wide runs SUBMIT for approval instead of one-click approving
"""

import os
from datetime import datetime

import pytest
from sqlalchemy.orm import Session

from core.auth import get_password_hash
from models import Employee, Organization, Payroll, User


def _admin_org(db_session: Session) -> Organization:
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return db_session.query(Organization).filter(
        Organization.id == admin.organization_id).first()


def _admin(db_session: Session) -> User:
    return db_session.query(User).filter(User.email == "admin@hrms.com").first()


def _employee(db_session: Session, org_id: int, code: str) -> Employee:
    emp = Employee(
        first_name="Maker", last_name="Checker",
        email=f"{code.lower()}@mc.example.com", employee_code=code,
        designation="Engineer", organization_id=org_id,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _second_user(db_session: Session, org_id: int) -> User:
    u = User(
        email="checker.finance@mc.example.com",
        password_hash=get_password_hash("check123"),
        full_name="Finance Checker", role="finance",
        organization_id=org_id, is_active=True,
    )
    db_session.add(u)
    db_session.flush()
    return u


def _login(client, email: str, password: str) -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    return data.get("token", data.get("access_token", ""))


def _generate(client, admin_token: str, emp_id: int, month=6, year=2026) -> dict:
    resp = client.post(
        "/api/payroll/generate",
        params={"employeeId": emp_id, "month": month, "year": year},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _set_status(client, token: str, payroll_id: int, status: str):
    return client.put(
        f"/api/payroll/{payroll_id}/status",
        json={"status": status},
        headers={"Authorization": f"Bearer {token}"},
    )


class TestMakerChecker:
    def test_generate_stamps_maker_and_snapshot(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "MC001")
        out = _generate(client, admin_token, emp.id)
        pr = db_session.query(Payroll).filter(Payroll.id == out["payrollId"]).first()
        assert pr is not None
        assert pr.submitted_by == client.admin_user_id
        assert pr.submitted_at is not None
        snap = pr.calculation_snapshot or {}
        assert snap.get("engine") == "policy_driven_v1"
        assert "attendance" in snap and "jurisdiction" in snap
        assert "figures" in snap and snap["figures"].get("gross_salary") is not None

    def test_submitter_cannot_approve(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "MC002")
        out = _generate(client, admin_token, emp.id)
        pid = out["payrollId"]
        r1 = _set_status(client, admin_token, pid, "pending_approval")
        assert r1.status_code == 200, r1.text
        r2 = _set_status(client, admin_token, pid, "approved")
        assert r2.status_code == 403, r2.text
        assert "Maker-checker" in r2.json().get("detail", "")

    def test_second_user_can_approve(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        checker = _second_user(db_session, org.id)
        emp = _employee(db_session, org.id, "MC003")
        out = _generate(client, admin_token, emp.id)
        pid = out["payrollId"]
        assert _set_status(client, admin_token, pid, "pending_approval").status_code == 200
        token2 = _login(client, checker.email, "check123")
        r = _set_status(client, token2, pid, "approved")
        assert r.status_code == 200, r.text
        pr = db_session.query(Payroll).filter(Payroll.id == pid).first()
        db_session.refresh(pr)
        assert pr.status == "approved"
        assert pr.approved_by == checker.id
        assert pr.submitted_by != pr.approved_by

    def test_process_endpoint_blocks_submitter(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "MC004")
        out = _generate(client, admin_token, emp.id)
        pid = out["payrollId"]
        assert _set_status(client, admin_token, pid, "pending_approval").status_code == 200
        r = client.post(
            "/api/payroll/process",
            json={"payrollIds": [pid], "action": "approve"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert pid in (body.get("makerCheckerBlocked") or [])
        assert pid not in (body.get("updated") or [])
        pr = db_session.query(Payroll).filter(Payroll.id == pid).first()
        db_session.refresh(pr)
        assert pr.status == "pending_approval", "blocked approval must not change status"

    def test_company_run_submits_instead_of_approving(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "MC005")
        out = _generate(client, admin_token, emp.id)
        pid = out["payrollId"]
        pr = db_session.query(Payroll).filter(Payroll.id == pid).first()
        pr.status = "draft"
        db_session.commit()
        r = client.post(
            "/api/payroll/process-company",
            json={"month": 6, "year": 2026},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "pending_approval"
        assert pid in body.get("items", body.get("updated", [])) or body["count"] >= 1
        db_session.refresh(pr)
        assert pr.status == "pending_approval"
        assert pr.submitted_by == client.admin_user_id
        assert pr.approved_by is None

    def test_bulk_pending_stamps_submission(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "MC006")
        out = _generate(client, admin_token, emp.id)
        pid = out["payrollId"]
        pr = db_session.query(Payroll).filter(Payroll.id == pid).first()
        pr.status = "draft"
        pr.submitted_by = None
        pr.submitted_at = None
        db_session.commit()
        r = client.post(
            "/api/payroll/bulk-status",
            json={"payrollIds": [pid], "action": "pending_approval"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert r.status_code == 200, r.text
        db_session.refresh(pr)
        assert pr.status == "pending_approval"
        assert pr.submitted_by == client.admin_user_id
