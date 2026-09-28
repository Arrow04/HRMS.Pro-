"""Compliance calendar: statutory due dates, filed tracking, amounts."""

from datetime import date, datetime

from models import Employee, Organization, Payroll, User
from services.compliance_calendar import (
    build_calendar,
    mark_filed,
    unmark_filed,
    _due_date,
)


def _admin_org_id(db_session) -> int:
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return admin.organization_id


class TestDueDates:
    def test_monthly_due_is_period_end_plus_offset(self):
        # March period -> 15 April
        assert _due_date({"day": 15, "month_offset": 1}, "monthly", 3, 2026) == date(2026, 4, 15)
        # December rolls into January
        assert _due_date({"day": 15, "month_offset": 1}, "monthly", 12, 2026) == date(2027, 1, 15)

    def test_day_clamps_to_month_end(self):
        assert _due_date({"day": 31, "month_offset": 1}, "monthly", 2, 2026) == date(2026, 3, 31)
        assert _due_date({"day": 31, "month_offset": 1}, "monthly", 4, 2026) == date(2026, 5, 31)

    def test_tds_quarterly_q4_uses_q4_offset(self):
        # Q4 (Jan-Mar) is due two months after quarter end: 31 May
        assert _due_date({"day": 31, "month_offset": 1, "q4_month_offset": 2},
                         "quarterly", 1, 2026) == date(2026, 5, 31)
        # Q1 (Apr-Jun) due 31 July
        assert _due_date({"day": 31, "month_offset": 1, "q4_month_offset": 2},
                         "quarterly", 4, 2026) == date(2026, 7, 31)


class TestCalendarApi:
    def test_calendar_lists_obligations(self, client, db_session, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.get("/api/payroll/compliance-calendar", headers=h)
        assert r.status_code == 200
        body = r.json()
        codes = {i["code"] for i in body["items"]}
        assert {"EPF_ECR", "ESI_RETURN", "PT_STATEMENT", "TDS_QUARTERLY", "LWF_RETURN"} <= codes
        for item in body["items"]:
            assert item["dueDate"]
            assert item["status"] in ("filed", "overdue", "due_soon", "upcoming")
        assert "counts" in body

    def test_overdue_and_upcoming_statuses(self, client, db_session, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        items = client.get("/api/payroll/compliance-calendar?lookback=2&horizon=3", headers=h).json()["items"]
        epf = [i for i in items if i["code"] == "EPF_ECR"]
        by_period = {i["periodLabel"]: i for i in epf}
        # Far-future periods can never be overdue
        today = date.today()
        for i in epf:
            due = date.fromisoformat(i["dueDate"])
            if i["status"] == "overdue":
                assert due < today
            if i["status"] == "upcoming":
                assert due > today

    def test_mark_filed_and_unmark(self, client, db_session, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        cal = client.get("/api/payroll/compliance-calendar", headers=h).json()
        target = next(i for i in cal["items"] if i["code"] == "EPF_ECR")

        r = client.post("/api/payroll/compliance-calendar/file", json={
            "code": target["code"], "periodKey": target["periodKey"], "notes": "Paid via ECR challan",
        }, headers=h)
        assert r.status_code == 200

        cal2 = client.get("/api/payroll/compliance-calendar", headers=h).json()
        t2 = next(i for i in cal2["items"] if i["periodKey"] == target["periodKey"])
        assert t2["status"] == "filed"
        assert t2["filedByName"]
        assert t2["notes"] == "Paid via ECR challan"

        r = client.delete(
            f"/api/payroll/compliance-calendar/file?periodKey={target['periodKey']}", headers=h,
        )
        assert r.status_code == 200
        cal3 = client.get("/api/payroll/compliance-calendar", headers=h).json()
        t3 = next(i for i in cal3["items"] if i["periodKey"] == target["periodKey"])
        assert t3["status"] != "filed"

    def test_calendar_amounts_come_from_payroll(self, client, db_session, admin_token):
        org_id = _admin_org_id(db_session)
        emp = Employee(
            first_name="Cal", last_name="Tester", email="cal.tester@example.com",
            employee_code="CAL001", organization_id=org_id,
            base_salary=600000, status="active", join_date=datetime(2020, 1, 1),
        )
        db_session.add(emp)
        db_session.flush()
        now = date.today()
        db_session.add(Payroll(
            employee_id=emp.id, organization_id=org_id,
            month=now.month, year=now.year, status="processed",
            basic_salary=50000, total_earnings=50000,
            pf_deduction=1800.0, pf_employer_contribution=1800.0,
            net_salary=46000,
        ))
        db_session.flush()

        h = {"Authorization": f"Bearer {admin_token}"}
        items = client.get("/api/payroll/compliance-calendar", headers=h).json()["items"]
        epf = next(i for i in items
                   if i["code"] == "EPF_ECR" and i["periodMonth"] == now.month and i["periodYear"] == now.year)
        assert epf["amount"] == 3600.0  # employee + employer
        assert epf["totals"]["pf_employee"] == 1800.0

    def test_unmark_missing_returns_404(self, client, db_session, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = client.delete("/api/payroll/compliance-calendar/file?periodKey=EPF_ECR:1999-01", headers=h)
        assert r.status_code == 404
