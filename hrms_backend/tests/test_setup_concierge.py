"""Comprehensive module-based setup regressions.

Each module's apply must write the REAL configuration surface:
  company    -> StatutorySetting (full PF/ESI/PT/gratuity/bonus rates),
                TaxRegime + slabs, org country/currency/state/FY
  attendance -> AttendancePolicy (schedule, overtime, late/half-day rules,
                geofence, comp-off) + org.settings.attendance mirror
  leave      -> LeaveTypes (quotas) + LeaveTemplate (accrual, carry-forward,
                encashment, application rules) + org.settings.leave mirror
  payroll    -> PayrollPolicy (divisor/rounding/proration) + benefit params
                + TDS knobs + org.settings.payroll mirror
  expenses   -> EXPENSE_CATEGORY lookup values + org.settings.expense
  performance-> org.settings.performance (review cycle + features)
"""
from datetime import datetime

from models import (
    AttendancePolicy, Company, LeaveTemplate, LeaveType, LookupCategory,
    LookupValue, Organization, PayrollPolicy, StatutorySetting, TaxRegime, User,
)


def _admin_org(db_session) -> Organization:
    admin = db_session.query(User).filter(User.email == "admin@hrms.com").first()
    return db_session.query(Organization).filter(
        Organization.id == admin.organization_id).first()


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _apply_module(client, token, module_id, answers=None, company_id=None):
    return client.post(
        f"/api/setup/modules/{module_id}",
        json={"answers": answers or {}, "companyId": company_id},
        headers=_headers(token),
    )


class TestModulesEndpoint:
    def test_modules_are_comprehensive(self, db_session, client, admin_token):
        resp = client.get("/api/setup/modules", headers=_headers(admin_token))
        assert resp.status_code == 200, resp.text
        modules = {m["id"]: m for m in resp.json()["modules"]}
        assert set(modules) == {"company", "attendance", "leave", "payroll", "expenses", "performance"}

        # Attendance module covers the real AttendancePolicy surface
        att_fields = {
            f["id"]
            for q in modules["attendance"]["questions"] if q["type"] == "fields"
            for f in q["fields"]
        }
        assert {"check_in_time", "overtime_rate", "overtime_threshold_hours",
                "late_grace_minutes", "half_day_threshold_hours",
                "geofence_enabled", "comp_off_enabled", "missing_checkout_rule"} <= att_fields

        # Leave module covers LeaveTemplate policy fields
        leave_fields = {
            f["id"]
            for q in modules["leave"]["questions"] if q["type"] == "fields"
            for f in q["fields"]
        }
        assert {"accrual_method", "max_balance_cap", "lapse_unused",
                "carry_forward_enabled", "encashment_enabled",
                "encashment_min_balance", "enable_half_day",
                "advance_notice_days"} <= leave_fields

        # Company module covers StatutorySetting rates
        stat_fields = {
            f["id"]
            for q in modules["company"]["questions"] if q["type"] == "fields"
            for f in q["fields"]
        }
        assert {"pf_applicable", "pf_employee_rate", "pf_wage_ceiling",
                "esi_applicable", "esi_gross_ceiling", "pt_applicable",
                "gratuity_applicable", "bonus_applicable"} <= stat_fields

    def test_unknown_module_404(self, db_session, client, admin_token):
        resp = _apply_module(client, admin_token, "nonexistent")
        assert resp.status_code == 404


class TestModuleApplies:
    def test_company_module_writes_full_statutory_surface(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        resp = _apply_module(client, admin_token, "company", {
            "country": "india", "state": "MH", "currency": "INR", "fy_start": "april",
            "pf_applicable": True, "pf_employee_rate": 12.0, "pf_employer_rate": 12.0,
            "pf_wage_ceiling": 15000.0, "pf_min_basic_for_exclusion": 15000.0,
            "esi_applicable": True, "esi_employee_rate": 0.75, "esi_employer_rate": 3.25,
            "esi_gross_ceiling": 21000.0, "pt_applicable": True, "pt_monthly_amount": 200.0,
            "gratuity_applicable": True, "bonus_applicable": True,
        })
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"]["modules"]["company"] is True

        stat = db_session.query(StatutorySetting).filter_by(organization_id=org.id).first()
        assert stat is not None
        assert stat.pf_employee_rate == 12.0
        assert stat.esi_gross_ceiling == 21000.0
        assert stat.pt_monthly_amount == 200.0
        assert stat.gratuity_applicable is True
        assert stat.bonus_applicable is True

        regime = db_session.query(TaxRegime).filter_by(organization_id=org.id).first()
        assert regime is not None
        assert regime.standard_deduction == 75000.0

        db_session.refresh(org)
        assert org.country == "india"
        assert org.default_currency == "INR"
        assert (org.settings or {}).get("registered_state") == "MH"
        assert (org.settings.get("payroll") or {}).get("fyStartMonth") == 4

    def test_attendance_module_writes_policy_surface(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        resp = _apply_module(client, admin_token, "attendance", {
            "workweek": "mon_sat",
            "check_in_time": "10:00", "check_out_time": "19:00", "break_hours": 1.0,
            "late_grace_minutes": 10,
            "overtime_enabled": True, "overtime_threshold_hours": 9.0,
            "overtime_rate": 2.0, "max_overtime_hours_per_month": 40,
            "half_day_threshold_hours": 4.0, "late_to_absent": "3",
            "missing_checkout_rule": "absent",
            "geofence_enabled": True, "geofence_radius": 250,
            "comp_off_enabled": True, "max_comp_off_balance": 8,
        })
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"]["modules"]["attendance"] is True

        att = db_session.query(AttendancePolicy).filter_by(organization_id=org.id).first()
        assert att is not None
        assert att.working_days == "1,2,3,4,5,6"
        assert att.check_in_time == "10:00"
        assert att.check_out_time == "19:00"
        assert att.late_mark_threshold_minutes == 10
        assert att.overtime_rate == 2.0
        assert att.overtime_threshold_hours == 9.0
        assert att.max_overtime_hours_per_month == 40.0
        assert att.late_to_absent_count == 3
        assert att.missing_checkout_rule == "absent"
        assert att.geofence_enabled is True
        assert att.geofence_radius == 250.0
        assert att.comp_off_enabled is True
        assert att.max_comp_off_balance == 8

        att_settings = (org.settings or {}).get("attendance") or {}
        assert att_settings.get("lateGraceMinutes") == 10
        assert att_settings.get("enableGeofence") is True

    def test_leave_module_writes_policy_surface(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        resp = _apply_module(client, admin_token, "leave", {
            "casual_enabled": True, "casual_days": 12,
            "sick_enabled": True, "sick_days": 10,
            "earned_enabled": True, "earned_days": 18, "earned_encashable": True,
            "maternity_enabled": True, "maternity_days": 182,
            "accrual_method": "monthly", "accrual_day": 1, "probation_accrual_rate": 0.5,
            "max_balance_cap": 30, "lapse_unused": True,
            "carry_forward_enabled": True, "carry_forward_max_days": 10,
            "carry_forward_expiry": "quarter", "carry_forward_use_it_or_lose_it": True,
            "encashment_enabled": True, "encashment_min_balance": 5,
            "encashment_rate": 1.0, "encashment_taxable": True,
            "enable_half_day": True, "min_leave_for_half_day": 2,
            "advance_notice_days": 3, "max_consecutive_days": 10,
            "holiday_optional_limit": 2, "approval_levels": 2,
        })
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"]["modules"]["leave"] is True

        casual = db_session.query(LeaveType).filter_by(
            organization_id=org.id, code="casual").first()
        assert casual is not None and casual.days_allowed == 12
        earned = db_session.query(LeaveType).filter_by(
            organization_id=org.id, code="earned").first()
        assert earned is not None and earned.is_encashable is True
        maternity = db_session.query(LeaveType).filter_by(
            organization_id=org.id, code="maternity").first()
        assert maternity is not None and maternity.days_allowed == 182

        tpl = db_session.query(LeaveTemplate).filter_by(organization_id=org.id).first()
        assert tpl is not None
        assert tpl.accrual_method == "monthly"
        assert tpl.max_balance_cap == 30
        assert tpl.lapse_unused is True
        assert tpl.carry_forward_enabled is True
        assert tpl.carry_forward_max_days == 10
        assert tpl.carry_forward_expiry == "quarter"
        assert tpl.carry_forward_use_it_or_lose_it is True
        assert tpl.encashment_enabled is True
        assert tpl.encashment_min_balance == 5
        assert tpl.encashment_taxable is True
        assert tpl.min_leave_for_half_day == 2
        assert tpl.advance_notice_days == 3
        assert tpl.max_consecutive_days == 10
        assert tpl.holiday_optional_limit == 2

        leave_settings = (org.settings or {}).get("leave") or {}
        assert leave_settings.get("annualLeave") == 18
        assert leave_settings.get("approvalLevels") == 2
        assert leave_settings.get("enableMultiLevelApproval") is True

    def test_payroll_module_writes_policy_and_benefits(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        resp = _apply_module(client, admin_token, "payroll", {
            "pay_frequency": "daily", "daily_divisor": "26",
            "pro_ration_method": "calendar_days", "rounding_method": "ceil",
            "decimal_places": 2, "payroll_day": 7,
            "gratuity_eligible_years": 5.0, "gratuity_days_per_year": 15.0,
            "gratuity_rate": 4.81, "gratuity_tax_exempt_ceiling": 2000000.0,
            "bonus_min_rate": 8.33, "bonus_max_rate": 20.0,
            "tds_enabled": True, "std_deduction": 75000.0,
            "rebate_threshold": 700000.0, "cess_rate": 4.0,
        })
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"]["modules"]["payroll"] is True

        policy = db_session.query(PayrollPolicy).filter_by(organization_id=org.id).first()
        assert policy is not None
        assert policy.daily_rate_divisor == 26.0
        assert policy.pro_ration_method == "calendar_days"
        assert policy.rounding_method == "ceil"
        assert policy.fy_start_month == 4

        stat = db_session.query(StatutorySetting).filter_by(organization_id=org.id).first()
        assert stat is not None
        assert stat.gratuity_eligible_years == 5.0
        assert stat.bonus_min_rate == 8.33

        regime = db_session.query(TaxRegime).filter_by(organization_id=org.id).first()
        assert regime is not None and regime.cess_rate == 4.0

        payroll_settings = (org.settings or {}).get("payroll") or {}
        assert payroll_settings.get("payrollFrequency") == "daily"
        assert payroll_settings.get("payrollDay") == 7
        assert payroll_settings.get("enableTaxDeduction") is True

    def test_expenses_module_seeds_categories(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        resp = _apply_module(client, admin_token, "expenses", {
            "categories": ["travel", "food", "medical"],
            "require_receipt": True, "dual_approval": True,
        })
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"]["modules"]["expenses"] is True

        cat = db_session.query(LookupCategory).filter_by(code="EXPENSE_CATEGORY").first()
        assert cat is not None
        codes = {
            v.code for v in db_session.query(LookupValue).filter_by(category_id=cat.id).all()
        }
        assert {"travel", "food", "medical"} <= codes

        exp_settings = (org.settings or {}).get("expense") or {}
        assert exp_settings.get("requireReceipt") is True
        assert exp_settings.get("dualApproval") is True

    def test_performance_module_writes_settings(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        resp = _apply_module(client, admin_token, "performance", {
            "cycle": "monthly",
            "enable_self_review": True, "enable_360_feedback": True,
            "enable_goal_tracking": False,
        })
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"]["modules"]["performance"] is True

        perf = (org.settings or {}).get("performance") or {}
        assert perf.get("reviewCycle") == "monthly"
        assert perf.get("enable360Feedback") is True
        assert perf.get("enableGoalTracking") is False

    def test_full_walkthrough_marks_all_modules_done(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        for module_id, answers in (
            ("company", {"state": "KA"}),
            ("attendance", {}),
            ("leave", {}),
            ("payroll", {}),
            ("expenses", {}),
            ("performance", {}),
        ):
            resp = _apply_module(client, admin_token, module_id, answers)
            assert resp.status_code == 200, f"{module_id}: {resp.text}"
        st = client.get("/api/setup/status", headers=_headers(admin_token)).json()
        assert st["complete"] is True, st["modules"]
        assert st["completed"] == st["total"] == 6


class TestCompanyScopedModules:
    def _company(self, db_session, org_id, name, code):
        co = Company(name=name, code=code, organization_id=org_id, status="active")
        db_session.add(co)
        db_session.flush()
        return co

    def test_attendance_scoped_per_company(self, db_session, client, admin_token):
        org = _admin_org(db_session)
        co_a = self._company(db_session, org.id, "North Wing", "NORTH")
        co_b = self._company(db_session, org.id, "South Wing", "SOUTH")

        assert _apply_module(client, admin_token, "attendance",
                             {"workweek": "mon_fri"}, co_a.id).status_code == 200

        att_a = db_session.query(AttendancePolicy).filter_by(
            organization_id=org.id, company_id=co_a.id).first()
        assert att_a is not None and att_a.working_days == "1,2,3,4,5"

        st_b = client.get("/api/setup/status", params={"companyId": co_b.id},
                          headers=_headers(admin_token)).json()
        assert st_b["modules"]["attendance"] is False, (
            "South Wing must not inherit North Wing's attendance policy"
        )
        st_a = client.get("/api/setup/status", params={"companyId": co_a.id},
                          headers=_headers(admin_token)).json()
        assert st_a["modules"]["attendance"] is True

    def test_unknown_company_404(self, db_session, client, admin_token):
        resp = _apply_module(client, admin_token, "attendance", {}, 999999)
        assert resp.status_code == 404

    def test_org_checklist_sees_per_company_config(self, db_session, client, admin_token):
        """Dashboard checklist (no companyId) must count config created for
        ANY company — the bug where per-company attendance/leave policies
        still showed as 'not configured' on the dashboard."""
        org = _admin_org(db_session)
        co_a = self._company(db_session, org.id, "Checklist Wing", "CHKW")
        assert _apply_module(client, admin_token, "attendance",
                             {"workweek": "mon_fri"}, co_a.id).status_code == 200
        assert _apply_module(client, admin_token, "leave",
                             {"casual_enabled": True, "casual_days": 7}, co_a.id).status_code == 200

        st = client.get("/api/setup/status", headers=_headers(admin_token)).json()
        assert st["modules"]["attendance"] is True, (
            "per-company attendance policy must clear the org checklist"
        )
        assert st["modules"]["leave"] is True, (
            "per-company leave template must clear the org checklist"
        )
