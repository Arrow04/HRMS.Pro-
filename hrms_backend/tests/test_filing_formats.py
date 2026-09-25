"""Government filing format tests (mandate section 51)."""
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
from services.statutory_reports import (
    BUILTIN_REPORT_DEFINITIONS,
    render_filing_file,
)


def teardown_module():
    s = sessionmaker(bind=app_engine)()
    try:
        from models import Attendance, Employee, Organization, Payroll, PayrollResultLine
        org_ids = [r[0] for r in s.query(Organization.id).filter(
            Organization.code.in_(["FILE"])).all()]
        if org_ids:
            s.query(PayrollResultLine).filter(
                PayrollResultLine.organization_id.in_(org_ids)).delete(synchronize_session=False)
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
        from models import Attendance, Employee, Organization
        from services.payroll_service import generate_payroll_record

        org = s.query(Organization).filter(Organization.code == "FILE").first()
        if not org:
            org = Organization(name="Filing Org", code="FILE", status="active")
            s.add(org)
            s.commit()
            s.refresh(org)
        emp = s.query(Employee).filter(Employee.employee_code == "FILE-1").first()
        if not emp:
            emp = Employee(first_name="Fi", last_name="Ling", email="file.emp@t.com",
                           employee_code="FILE-1", organization_id=org.id,
                           base_salary=120000, status="active",
                           join_date=datetime(2020, 1, 1),
                           pf_uan="100123456789", pan_number="ABCDE1234F",
                           bank_account_number="7777777777")
            s.add(emp)
            s.commit()
            s.refresh(emp)
        for d in range(1, 31):
            s.add(Attendance(employee_id=emp.id, organization_id=org.id,
                             date=datetime(2026, 4, d), status="present",
                             is_manual_entry=True))
        s.commit()
        generate_payroll_record(s, emp, 4, 2026,
                                override_esi_deduction=0, override_professional_tax=0,
                                override_tds=0)
        yield {"org": org, "emp": emp, "session": s}
    finally:
        s.close()


class TestFilingFormats:
    def test_epf_ecr_pipe_format(self, env):
        s = env["session"]
        definition = next(d for d in BUILTIN_REPORT_DEFINITIONS if d["code"] == "EPF_ECR")
        out = render_filing_file(s, definition, env["org"].id, 4, 2026,
                                 establishment_code="MHBAN1234567000")
        lines = out["content"].strip().splitlines()
        assert lines[0].startswith("#HDR#~MHBAN1234567000~04-2026~1")
        assert lines[-1].startswith("#TRL#~1~")
        # member row: UAN~Name~...~NCP~0 with pipe delimiters
        row = lines[1].split("~")
        assert row[0] == "100123456789"
        assert row[1] == "Fi Ling"
        assert len(row) == 13   # ECR member row column count
        assert out["filename"] == "EPF_ECR_202604.txt"

    def test_esi_return_format(self, env):
        s = env["session"]
        definition = next(d for d in BUILTIN_REPORT_DEFINITIONS if d["code"] == "ESI_RETURN")
        out = render_filing_file(s, definition, env["org"].id, 4, 2026,
                                 establishment_code="ESI123")
        lines = out["content"].strip().splitlines()
        assert lines[0].startswith("ESIRET~ESI123~04-2026~")
        assert lines[-1].startswith("ESITRL~1~")

    def test_pt_statement_csv(self, env):
        s = env["session"]
        definition = next(d for d in BUILTIN_REPORT_DEFINITIONS if d["code"] == "PT_STATEMENT")
        out = render_filing_file(s, definition, env["org"].id, 4, 2026)
        assert out["filename"].endswith(".csv")
        assert "ABCDE1234F" in out["content"]

    def test_new_format_is_configuration_only(self, env):
        """A brand-new government file layout = definition data only."""
        s = env["session"]
        custom = {
            "code": "STATE_CESS",
            "name": "State Cess Return",
            "fields": [
                {"key": "name", "label": "Name", "source": "employee_name"},
                {"key": "cess", "label": "Cess", "formula": "gross_salary * 0.01"},
            ],
            "file_layout": {
                "delimiter": "|",
                "header": "CESS|{establishment_code}|{record_count}",
                "row": "{name}|{cess}",
                "footer": "END|{total_cess}",
            },
        }
        out = render_filing_file(s, custom, env["org"].id, 4, 2026,
                                 establishment_code="ST1")
        lines = out["content"].strip().splitlines()
        assert lines[0] == "CESS|ST1|1"
        assert lines[1].startswith("Fi Ling|")
        assert lines[2].startswith("END|")
