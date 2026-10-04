"""Leave accrual scheduler + hash-chained audit regressions.

Leave accrual:
  - monthly/quarterly/yearly templates credit quota slices per period
  - LeaveAccrualLedger UNIQUE (employee, type, year, month) = idempotent
  - never exceeds the configured annual quota; frontloaded rows untouched

Audit chain:
  - every AuditLog insert carries previous_hash + signature
  - chain links: row[n].previous_hash == row[n-1].signature
  - tampering breaks verification at the exact row
"""

from datetime import datetime

from models import (
    AuditLog,
    Employee,
    LeaveAccrualLedger,
    LeaveBalance,
    LeaveTemplate,
    LeaveType,
    Organization,
    User,
)


def _admin_org(db_session) -> Organization:
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return db_session.query(Organization).filter(
        Organization.id == admin.organization_id).first()


def _employee(db_session, org_id, code) -> Employee:
    emp = Employee(
        first_name="Accr", last_name="Ual",
        email=f"{code.lower()}@accr.example.com", employee_code=code,
        designation="Engineer", organization_id=org_id,
        base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _leave_type(db_session, org_id, code="AL") -> LeaveType:
    lt = LeaveType(name=f"Leave {code}", code=code, organization_id=org_id,
                   days_allowed=12, is_paid=True)
    db_session.add(lt)
    db_session.flush()
    return lt


def _template(db_session, org_id, employee, lt, method, days=12, **kw):
    tpl = LeaveTemplate(
        organization_id=org_id, name=f"LT {method}", status="active",
        effective_from=datetime(2026, 1, 1).date(),
        accrual_method=method,
        body={"leaveTypes": [{"code": lt.code, "days": days, "paid": True}]},
        **kw,
    )
    db_session.add(tpl)
    db_session.flush()
    employee.leave_template_id = tpl.id
    db_session.flush()
    return tpl


class TestLeaveAccrual:
    def test_monthly_accrual_and_idempotency(self, db_session):
        from services.leave_accrual import accrue_leave_for_period
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "AC001")
        lt = _leave_type(db_session, org.id, "ALM")
        _template(db_session, org.id, emp, lt, "monthly", days=12)

        out = accrue_leave_for_period(db_session, 2026, 1, org_id=org.id)
        assert out["credited"] == 1
        assert out["total_days"] == 1.0
        bal = db_session.query(LeaveBalance).filter_by(
            employee_id=emp.id, leave_type_id=lt.id, year=2026).first()
        assert bal is not None
        assert bal.total_days == 1
        assert bal.remaining_days == 1

        # Re-run the same period: ledger UNIQUE makes it a no-op
        out2 = accrue_leave_for_period(db_session, 2026, 1, org_id=org.id)
        assert out2["credited"] == 0
        assert db_session.query(LeaveAccrualLedger).filter_by(
            employee_id=emp.id, leave_type_id=lt.id, year=2026, month=1).count() == 1
        db_session.refresh(bal)
        assert bal.total_days == 1, "re-run must not double-credit"

        # Next month credits the next slice
        out3 = accrue_leave_for_period(db_session, 2026, 2, org_id=org.id)
        assert out3["credited"] == 1
        db_session.refresh(bal)
        assert bal.total_days == 2

    def test_quarterly_credits_in_quarter_months_only(self, db_session):
        from services.leave_accrual import accrue_leave_for_period
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "AC002")
        lt = _leave_type(db_session, org.id, "ALQ")
        _template(db_session, org.id, emp, lt, "quarterly", days=12)

        out = accrue_leave_for_period(db_session, 2026, 4, org_id=org.id)
        assert out["credited"] == 1 and out["total_days"] == 3.0  # 12/4
        out2 = accrue_leave_for_period(db_session, 2026, 5, org_id=org.id)
        assert out2["credited"] == 0

    def test_yearly_credits_only_in_january(self, db_session):
        from services.leave_accrual import accrue_leave_for_period
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "AC003")
        lt = _leave_type(db_session, org.id, "ALY")
        _template(db_session, org.id, emp, lt, "yearly", days=15)

        out = accrue_leave_for_period(db_session, 2026, 1, org_id=org.id)
        assert out["credited"] == 1 and out["total_days"] == 15.0
        out2 = accrue_leave_for_period(db_session, 2026, 2, org_id=org.id)
        assert out2["credited"] == 0

    def test_frontloaded_rows_are_never_touched(self, db_session):
        from services.leave_accrual import accrue_leave_for_period
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "AC004")
        lt = _leave_type(db_session, org.id, "ALF")
        _template(db_session, org.id, emp, lt, "frontloaded", days=12)
        # Legacy init already granted the full quota
        db_session.add(LeaveBalance(
            employee_id=emp.id, leave_type_id=lt.id, year=2026,
            total_days=12, used_days=0, remaining_days=12,
        ))
        db_session.flush()

        out = accrue_leave_for_period(db_session, 2026, 3, org_id=org.id)
        assert out["credited"] == 0
        bal = db_session.query(LeaveBalance).filter_by(
            employee_id=emp.id, leave_type_id=lt.id, year=2026).first()
        assert bal.total_days == 12

    def test_credit_never_exceeds_annual_quota(self, db_session):
        from services.leave_accrual import accrue_leave_for_period
        org = _admin_org(db_session)
        emp = _employee(db_session, org.id, "AC005")
        lt = _leave_type(db_session, org.id, "ALC")
        _template(db_session, org.id, emp, lt, "monthly", days=12)
        # 11 of 12 already granted → only 1 day of pending pool remains
        db_session.add(LeaveBalance(
            employee_id=emp.id, leave_type_id=lt.id, year=2026,
            total_days=11, used_days=0, remaining_days=11,
        ))
        db_session.flush()

        out = accrue_leave_for_period(db_session, 2026, 6, org_id=org.id)
        assert out["credited"] == 1 and out["total_days"] == 1.0
        bal = db_session.query(LeaveBalance).filter_by(
            employee_id=emp.id, leave_type_id=lt.id, year=2026).first()
        assert bal.total_days == 12

        out2 = accrue_leave_for_period(db_session, 2026, 7, org_id=org.id)
        assert out2["credited"] == 0, "pool exhausted — nothing more to credit"

    def test_job_scheduler_handler_wired(self, db_session):
        from services.job_scheduler import JOBS, run_job
        assert "leave_accrual" in JOBS
        org = _admin_org(db_session)
        result = run_job(db_session, "leave_accrual", org_id=org.id)
        assert result["status"] == "success"
        assert "credited" in result


class TestHashChainedAudit:
    def _row(self, org_id, action, entity_id):
        return AuditLog(
            user_id=None, organization_id=org_id, user_name="Chain Test",
            action=action, module="payroll", entity_type="payroll",
            entity_id=str(entity_id), changes={"x": 1},
        )

    def test_rows_are_chained(self, db_session):
        org = _admin_org(db_session)
        r1 = self._row(org.id, "payroll_status:pending_approval", 1)
        r2 = self._row(org.id, "payroll_status:approved", 1)
        r3 = self._row(org.id, "payroll_status:paid", 1)
        db_session.add_all([r1, r2, r3])
        db_session.commit()

        assert r1.signature and r2.signature and r3.signature
        assert r1.previous_hash == "GENESIS"
        assert r2.previous_hash == r1.signature
        assert r3.previous_hash == r2.signature

    def test_verify_passes_on_clean_chain(self, db_session):
        from services.audit_chain import verify_audit_chain
        org = _admin_org(db_session)
        for i in range(3):
            db_session.add(self._row(org.id, f"action_{i}", i))
        db_session.commit()

        out = verify_audit_chain(db_session, org_id=org.id)
        assert out["valid"] is True
        assert out["checked"] >= 3

    def test_tampering_breaks_chain_at_exact_row(self, db_session):
        from services.audit_chain import verify_audit_chain
        org = _admin_org(db_session)
        rows = [self._row(org.id, f"clean_{i}", i) for i in range(3)]
        db_session.add_all(rows)
        db_session.commit()

        # Tamper with the middle row
        rows[1].action = "payroll_status:approved (forged amount 999999)"
        db_session.commit()

        out = verify_audit_chain(db_session, org_id=org.id)
        assert out["valid"] is False
        assert out["firstInvalidId"] == rows[1].id

    def test_verify_endpoint(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        for i in range(2):
            db_session.add(self._row(org.id, f"ep_{i}", i))
        db_session.commit()
        resp = client.get("/api/audit/verify",
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["valid"] is True
        assert body["checked"] >= 2
