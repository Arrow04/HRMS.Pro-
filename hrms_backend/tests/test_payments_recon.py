"""Bank payment batches, reconciliation & year-end tests (mandate 49, 52, 53)."""
import os

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://postgres:123456@localhost:5432/hrms_test",
)
os.environ["ALLOW_SQLITE_FALLBACK"] = "false"
os.environ["RUN_SCHEMA_SYNC"] = "false"
os.environ["SEED_DEFAULT_USERS"] = "true"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

import calendar
from datetime import datetime

import pytest
from sqlalchemy.orm import sessionmaker

from database import Base, engine as app_engine
from services.payment_engine import (
    create_payment_batch,
    generate_payment_file,
    mark_transactions,
    reconcile_batch,
    reconcile_payroll_accounting,
    year_end_summary,
)


def teardown_module():
    s = sessionmaker(bind=app_engine)()
    try:
        from models import (Attendance, Employee, Organization, Payroll,
                            PaymentBatch, PaymentTransaction, PayrollResultLine)
        org_ids = [r[0] for r in s.query(Organization.id).filter(
            Organization.code.in_(["PAYB"])).all()]
        if org_ids:
            batch_ids = [r[0] for r in s.query(PaymentBatch.id).filter(
                PaymentBatch.organization_id.in_(org_ids)).all()]
            s.query(PayrollResultLine).filter(
                PayrollResultLine.organization_id.in_(org_ids)).delete(synchronize_session=False)
            if batch_ids:
                s.query(PaymentTransaction).filter(
                    PaymentTransaction.batch_id.in_(batch_ids)).delete(synchronize_session=False)
            s.query(PaymentBatch).filter(
                PaymentBatch.organization_id.in_(org_ids)).delete(synchronize_session=False)
            s.query(Payroll).filter(Payroll.organization_id.in_(org_ids)).delete(synchronize_session=False)
            for t in (Attendance, Employee):
                s.query(t).filter(t.organization_id.in_(org_ids)).delete(synchronize_session=False)
        s.commit()
    finally:
        s.close()


@pytest.fixture(scope="module")
def env():
    Base.metadata.create_all(bind=app_engine)
    s = sessionmaker(bind=app_engine)()
    try:
        from models import Employee, Organization, PaymentBatch, PaymentTransaction
        # Pre-clean: a previously crashed run must not leak batch state.
        _old = s.query(PaymentBatch).filter(
            PaymentBatch.organization_id.in_(
                s.query(Organization.id).filter(Organization.code == "PAYB"))
        ).all()
        for b in _old:
            s.query(PaymentTransaction).filter(
                PaymentTransaction.batch_id == b.id).delete(synchronize_session=False)
            s.delete(b)
        s.commit()
        org = s.query(Organization).filter(Organization.code == "PAYB").first()
        if not org:
            org = Organization(name="Payments Org", code="PAYB", status="active")
            s.add(org)
            s.commit()
            s.refresh(org)

        def emp(code, bank):
            e = s.query(Employee).filter(Employee.employee_code == code).first()
            if not e:
                e = Employee(first_name=code, last_name="Pay", email=f"{code.lower()}@t.com",
                             employee_code=code, organization_id=org.id,
                             base_salary=120000, status="active",
                             join_date=datetime(2020, 1, 1),
                             bank_account_number=bank)
                s.add(e)
                s.commit()
                s.refresh(e)
            return e

        e1 = emp("PAYB-1", "1111111111")
        e2 = emp("PAYB-2", None)   # no bank -> must be excluded from the batch
        yield {"org": org, "e1": e1, "e2": e2, "session": s}
    finally:
        s.close()


def _finalize(s, emp, month=8, year=2026):
    from models import Attendance, Payroll
    from services.payroll_service import generate_payroll_record
    dim = calendar.monthrange(year, month)[1]
    for d in range(1, dim + 1):
        s.add(Attendance(employee_id=emp.id, organization_id=emp.organization_id,
                         date=datetime(year, month, d), status="present",
                         is_manual_entry=True))
    s.commit()
    p = generate_payroll_record(s, emp, month, year,
                                override_esi_deduction=0, override_professional_tax=0,
                                override_tds=0)
    p.status = "processed"
    s.commit()
    return p


class TestPaymentBatches:
    def test_batch_excludes_unpayable_rows(self, env):
        s = env["session"]
        _finalize(s, env["e1"])
        _finalize(s, env["e2"])
        out = create_payment_batch(s, env["org"].id, 8, 2026)
        assert out["batch"]["employeeCount"] == 1
        assert any(x["employeeId"] == env["e2"].id for x in out["skipped"])
        assert out["batch"]["totalAmount"] > 0

    def test_payment_file_generation(self, env):
        s = env["session"]
        from models import PaymentBatch
        batch = s.query(PaymentBatch).filter(
            PaymentBatch.organization_id == env["org"].id
        ).order_by(PaymentBatch.id.desc()).first()
        name, content = generate_payment_file(s, batch)
        assert name.endswith(".csv")
        lines = [l for l in content.strip().splitlines() if l]
        assert len(lines) == 2   # header + 1 payee
        assert "bank_account" not in content.lower() or "PAYB" in content

    def test_mark_outcomes(self, env):
        s = env["session"]
        from models import PaymentBatch
        batch = s.query(PaymentBatch).filter(
            PaymentBatch.organization_id == env["org"].id
        ).order_by(PaymentBatch.id.desc()).first()
        out = mark_transactions(s, batch, [
            {"payrollId": t.payroll_id, "status": "paid", "referenceNo": "BANK123"}
            for t in batch.transactions
        ])
        assert out["batch"]["status"] == "paid"
        assert all(t["status"] == "paid" for t in out["transactions"])


class TestReconciliation:
    def test_reconcile_detects_differences(self, env):
        s = env["session"]
        from models import PaymentBatch
        batch = s.query(PaymentBatch).filter(
            PaymentBatch.organization_id == env["org"].id
        ).order_by(PaymentBatch.id.desc()).first()
        t = batch.transactions[0]
        report = reconcile_batch(s, batch, [
            {"transactionId": t.id, "amount": t.amount},          # matched
            {"transactionId": t.id, "amount": t.amount},          # duplicate
            {"transactionId": 999999, "amount": 50},              # bank-only
        ])
        assert len(report["matched"]) == 1
        assert len(report["duplicates"]) == 1
        assert report["book_total"] == round(float(t.amount), 2)

    def test_amount_mismatch_detected(self, env):
        s = env["session"]
        from models import PaymentBatch
        batch = s.query(PaymentBatch).filter(
            PaymentBatch.organization_id == env["org"].id
        ).order_by(PaymentBatch.id.desc()).first()
        t = batch.transactions[0]
        report = reconcile_batch(s, batch, [
            {"transactionId": t.id, "amount": float(t.amount) + 100},
        ])
        assert len(report["amount_mismatch"]) == 1
        assert report["unreconciled_total"] != 0

    def test_payroll_accounting_reconciliation_shape(self, env):
        s = env["session"]
        out = reconcile_payroll_accounting(s, env["org"].id, 8, 2026)
        assert out["period"] == {"month": 8, "year": 2026}
        assert "difference" in out


class TestYearEnd:
    def test_ytd_summary(self, env):
        s = env["session"]
        out = year_end_summary(s, env["org"].id, "2026-27")
        assert out["financialYear"] == "2026-27"
        assert out["totals"]["gross"] > 0
        assert out["employees"], "processed payrolls must appear in the YTD summary"
        assert "preserved" in out["note"]
