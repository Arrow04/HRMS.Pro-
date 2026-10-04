"""Guided concierge setup regressions — questions + company-wide apply."""

from models import (
    AttendancePolicy, LeaveTemplate, LeaveType, Organization,
    PayrollPolicy, StatutorySetting, TaxRegime, User,
)


def _admin_org(db_session):
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return db_session.query(Organization).filter(
        Organization.id == admin.organization_id).first()


class TestSetupQuestions:
    def test_questions_endpoint(self, db_session, client, admin_token):
        resp = client.get("/api/setup/questions",
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200, resp.text
        qs = resp.json()["questions"]
        ids = [q["id"] for q in qs]
        assert ids == ["country", "workweek", "work_hours", "pay_type", "leaves", "statutory"]
        for q in qs:
            assert q["title"] and q["options"], q["id"]
            assert q["type"] in ("choice", "multi")


class TestConciergeApply:
    def _post(self, client, token, **answers):
        payload = {
            "country": "india", "workweek": "mon_fri", "work_hours": "9-6",
            "pay_type": "monthly", "leaves": ["casual", "sick", "earned"],
            "statutory": "yes",
        }
        payload.update(answers)
        return client.post("/api/setup/concierge", json=payload,
                           headers={"Authorization": f"Bearer {token}"})

    def test_full_apply_configures_org(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        resp = self._post(client, admin_token, pay_type="daily", workweek="mon_sat",
                          work_hours="10-7",
                          leaves=["casual", "sick", "earned", "maternity"])
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert any("Statutory" in a for a in body["applied"])
        assert any("Attendance" in a for a in body["applied"])
        assert any("Payroll policy" in a for a in body["applied"])
        assert any("tax slabs" in a.lower() for a in body["applied"])
        assert any("Leave types" in a for a in body["applied"])

        att = db_session.query(AttendancePolicy).filter_by(organization_id=org.id).first()
        assert att is not None
        assert att.working_days == "1,2,3,4,5,6"
        assert att.working_days_per_week == 6
        assert att.check_in_time == "10:00"
        assert att.check_out_time == "19:00"

        policy = db_session.query(PayrollPolicy).filter_by(organization_id=org.id).first()
        assert policy is not None
        assert policy.daily_rate_divisor == 26.0
        assert policy.fy_start_month == 4

        assert db_session.query(StatutorySetting).filter_by(organization_id=org.id).first() is not None
        assert db_session.query(TaxRegime).filter_by(organization_id=org.id).first() is not None

        codes = {lt.code for lt in db_session.query(LeaveType).filter_by(organization_id=org.id).all()}
        assert {"casual", "sick", "earned", "maternity"} <= codes

        tpl = db_session.query(LeaveTemplate).filter_by(organization_id=org.id).first()
        assert tpl is not None
        assert tpl.status == "active"

        # Status endpoint now shows those steps done
        st = self._status(client, admin_token)
        by_id = {s["id"]: s for s in st["steps"]}
        assert by_id["statutory_settings"]["done"] is True
        assert by_id["tax_regime"]["done"] is True
        assert by_id["payroll_policy"]["done"] is True
        assert by_id["leave_types"]["done"] is True

    def _status(self, client, token):
        resp = client.get("/api/setup/status",
                          headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        return resp.json()

    def test_idempotent_second_apply(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        first = self._post(client, admin_token)
        assert first.status_code == 200
        second = self._post(client, admin_token)
        assert second.status_code == 200
        assert second.json()["applied"] == [], "second apply must not re-create anything"
        att_count = db_session.query(AttendancePolicy).filter_by(organization_id=org.id).count()
        assert att_count == 1
        regime_count = db_session.query(TaxRegime).filter_by(organization_id=org.id).count()
        assert regime_count == 1

    def test_statutory_later_skips_deductions(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        resp = self._post(client, admin_token, statutory="later")
        assert resp.status_code == 200
        assert db_session.query(StatutorySetting).filter_by(organization_id=org.id).first() is None
        # Attendance + payroll policy still configured
        assert db_session.query(AttendancePolicy).filter_by(organization_id=org.id).first() is not None
        assert db_session.query(PayrollPolicy).filter_by(organization_id=org.id).first() is not None

    def test_answers_recorded_on_org(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        self._post(client, admin_token, pay_type="daily")
        db_session.refresh(org)
        setup = (org.settings or {}).get("setup") or {}
        assert setup.get("guidedConfigured") is True
        assert setup.get("answers", {}).get("pay_type") == "daily"
