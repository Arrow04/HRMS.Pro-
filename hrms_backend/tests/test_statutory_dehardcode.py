"""De-hardcoding statutory values — Phase 2b regression.

Guards three fixes:
1. Seeded (flat, kind-less) gratuity rule definitions used to crash
   evaluate_definition with "Unknown rule definition kind"; the settlement
   engine now accepts both shapes and overlays Act defaults from
   gratuity_engine.gratuity_act_default (no inline Act literals).
2. Gratuity service years are capped at the Act max_years (15).
3. Bonus Act knobs resolve through resolve_bonus_params
   (StatutorySetting → statutory_rule_configs → Act defaults) instead of
   hard-coded signature values at each call site.

Phase 2b-2 additionally guards: ECR EPS formulas driven by configuration,
Form 16 caps read from TaxRegime, NPS caps reused from the scheme defaults,
legacy ESI total split on the statutory ratio, overtime multiplier chain
(policy → published rule → default), settings-screen PF/ESI rates from
config, and the rule engine's missing EPS ceiling key reading
statutory_rule_configs instead of a code literal.
"""
from datetime import date, datetime

from models import Employee, Organization, StatutoryRule, StatutorySetting
from services.compliance_engine import calculate_gratuity, resolve_bonus_params
from services.gratuity_engine import calculate_gratuity_settlement, gratuity_act_default


def _org(db_session, code):
    org = Organization(name=f"DeHard {code}", code=code, country="India")
    db_session.add(org)
    db_session.flush()
    return org


def _emp(db_session, org, code, join_date):
    emp = Employee(
        first_name="De", last_name="Hard", email=f"{code.lower()}@example.com",
        employee_code=code, organization_id=org.id,
        base_salary=600000, status="active", join_date=join_date,
    )
    db_session.add(emp)
    db_session.flush()
    return emp


class TestGratuityDefinitionShapes:
    def test_flat_seeded_rule_shape_applies(self, db_session):
        """Kind-less seeded definition must resolve (was: RuleExpressionError)."""
        org = _org(db_session, "DHG01")
        emp = _emp(db_session, org, "DHG01", datetime(2020, 1, 1))
        db_session.add(StatutoryRule(
            rule_type="gratuity", country="India", organization_id=org.id,
            effective_from=date(2026, 1, 1), status="active", version=1,
            definition={
                "applicable": True, "rate": 4.81, "eligible_years": 5,
                "days_per_year": 15, "divisor": 10, "max_years": 15,
                "tax_exempt_ceiling": 999999999,
            },
        ))
        db_session.flush()

        out = calculate_gratuity_settlement(db_session, emp, as_of=date(2026, 6, 1))
        assert out["divisor"] == 10.0, "flat seeded divisor must win over the 26 default"
        wage = 600000 / 12
        assert out["service_years"] == 6  # 2020-01-01 → 2026-06-01, part-year < 240 days
        assert abs(out["amount"] - (15 * wage * 6) / 10) < 0.01

    def test_service_years_capped_at_act_max(self, db_session):
        """20+ years of service pays only the first 15 years (Gratuity Act)."""
        org = _org(db_session, "DHG02")
        emp = _emp(db_session, org, "DHG02", datetime(2000, 1, 1))

        out = calculate_gratuity_settlement(db_session, emp, as_of=date(2026, 6, 1))
        assert out["service_years"] >= 20
        assert out["paid_years"] == 15.0
        wage = 600000 / 12
        expected = round((15 * wage * 15) / 26, 2)
        assert abs(out["amount"] - expected) < 0.01

    def test_act_defaults_single_source(self, db_session):
        assert gratuity_act_default("divisor") == 26.0
        assert gratuity_act_default("max_years") == 15.0
        assert gratuity_act_default("min_years") == 5.0
        assert gratuity_act_default("tax_exempt_ceiling") == 2000000.0

    def test_compliance_gratuity_divisor_overridable(self, db_session):
        default = calculate_gratuity(26000, 10, None)
        assert default["amount"] == round(15 * 26000 * 10 / 26, 2)
        custom = calculate_gratuity(26000, 10, None, divisor=30)
        assert custom["amount"] == round(15 * 26000 * 10 / 30, 2)


class TestBonusParamResolution:
    def test_org_setting_wins(self, db_session):
        org = _org(db_session, "DHB01")
        s = StatutorySetting(bonus_min_rate=10.0, bonus_max_rate=25.0,
                             bonus_wage_ceiling=5000.0, bonus_eligible_ceiling=30000.0)
        s.organization_id = org.id
        s.status = "active"
        db_session.add(s)
        db_session.flush()

        params = resolve_bonus_params(db_session, org.id)
        assert params["min_rate"] == 10.0
        assert params["max_rate"] == 25.0
        assert params["calc_ceiling"] == 5000.0
        assert params["eligible_ceiling"] == 30000.0

    def test_act_defaults_without_any_config(self, db_session):
        org = _org(db_session, "DHB02")
        params = resolve_bonus_params(db_session, org.id)
        assert params["min_rate"] == 8.33
        assert params["max_rate"] == 20.0
        assert params["calc_ceiling"] == 7000.0
        assert params["eligible_ceiling"] == 21000.0

    def test_bonus_endpoint_uses_org_rates(self, db_session, client, admin_token):
        from models import User
        import os
        admin = db_session.query(User).filter(
            User.email == os.getenv("ADMIN_EMAIL", "admin@hrms.com")
        ).first()
        # Isolate: one active row for the admin org, min rate 10%.
        db_session.query(StatutorySetting).filter(
            StatutorySetting.organization_id == admin.organization_id
        ).delete(synchronize_session=False)
        s = StatutorySetting(bonus_min_rate=10.0)
        s.organization_id = admin.organization_id
        s.status = "active"
        db_session.add(s)
        db_session.flush()

        resp = client.post(
            "/api/payroll/calculate/bonus",
            json={"gross_salary": 5000, "months_worked": 12},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200, resp.text
        # 5000 capped at 7000 → 60000 annual × 10% = 6000 (Act default 8.33% → 4998)
        assert resp.json()["minimum"] == 6000.0


# ── Phase 2b-2: remaining literal clusters ─────────────────────────────────

class TestEcrFormulaConfigDriven:
    def test_statutory_formula_ctx_reads_org_setting(self, db_session):
        from services.statutory_reports import _statutory_formula_ctx
        org = _org(db_session, "DHE01")
        s = StatutorySetting(eps_employer_rate=9.5, eps_wage_ceiling=20000.0,
                             pf_applicable=True, status="active")
        s.organization_id = org.id
        db_session.add(s)
        db_session.flush()

        ctx = _statutory_formula_ctx(db_session, org.id)
        assert ctx["EPS_RATE"] == 9.5
        assert ctx["EPS_WAGE_CEILING"] == 20000.0

    def test_ecr_eps_share_follows_config_not_literal(self, db_session):
        from models import Payroll
        from services.statutory_reports import (
            BUILTIN_REPORT_DEFINITIONS, render_report,
        )
        org = _org(db_session, "DHE02")
        emp = _emp(db_session, org, "DHE02", datetime(2020, 1, 1))
        s = StatutorySetting(eps_employer_rate=9.5, eps_wage_ceiling=20000.0,
                             pf_applicable=True, status="active")
        s.organization_id = org.id
        db_session.add(s)
        db_session.add(Payroll(
            employee_id=emp.id, organization_id=org.id, month=6, year=2026,
            gross_salary=30000, basic_salary=18000, pf_deduction=2160.0,
            net_salary=27000, status="approved",
        ))
        db_session.flush()

        definition = next(d for d in BUILTIN_REPORT_DEFINITIONS if d["code"] == "EPF_ECR")
        report = render_report(db_session, definition, org.id, 6, 2026)
        row = report["rows"][0]
        # 18000 (under the 20000 ceiling) × 9.5% — the old formula hard-coded
        # 15000 × 8.33% = 1249.5 regardless of configuration.
        assert isinstance(row["eps_contribution"], (int, float)), row["eps_contribution"]
        assert abs(row["eps_contribution"] - 1710.0) < 0.01
        assert abs(row["epf_eps_diff"] - (2160.0 - 1710.0)) < 0.01


class TestForm16RegimeCaps:
    def test_caps_read_from_regime_columns(self):
        from types import SimpleNamespace
        from services.form16_service import STD_80D_CAP, _regime_cap

        regime = SimpleNamespace(section_80d_cap=30000.0, standard_deduction=75000.0)
        assert _regime_cap(regime, "section_80d_cap", STD_80D_CAP) == 30000.0
        assert _regime_cap(regime, "standard_deduction", 50000.0) == 75000.0
        # Legacy regime rows predate the columns → Act fallback, not a crash.
        legacy = SimpleNamespace(section_80d_cap=None, standard_deduction=None)
        assert _regime_cap(legacy, "section_80d_cap", STD_80D_CAP) == STD_80D_CAP
        assert _regime_cap(None, "section_80d_cap", STD_80D_CAP) == STD_80D_CAP


class TestNpsDefinitionMerge:
    def test_setting_rates_overlay_shared_scheme_defaults(self, db_session):
        from services.retirement_engine import _resolve_nps_definition
        org = _org(db_session, "DHN01")
        emp = _emp(db_session, org, "DHN01", datetime(2020, 1, 1))
        s = StatutorySetting(nps_employee_rate=11.0, nps_employer_rate=13.0,
                             status="active")
        s.organization_id = org.id
        db_session.add(s)
        db_session.flush()

        d = _resolve_nps_definition(db_session, emp, date(2026, 6, 1))
        assert d["outputs"]["employee_rate"]["value"] == 11.0
        assert d["outputs"]["employer_rate"]["value"] == 13.0
        # Caps/basis come from DEFAULT_NPS_DEFINITION — never re-hardcoded.
        assert d["outputs"]["ccd1b_cap"]["value"] == 50000.0
        assert d["outputs"]["ccd1_pct_cap"]["value"] == 10.0
        assert d["outputs"]["wage_basis"]["value"] == "BASIC_DA"


class TestEsiLegacySplit:
    def test_legacy_single_esi_percent_splits_on_statutory_ratio(self, db_session):
        from services.payroll_service import _get_statutory_settings
        org = _org(db_session, "DHS01")
        emp = _emp(db_session, org, "DHS01", datetime(2020, 1, 1))

        st = _get_statutory_settings(db_session, emp, scoped={"esiPercent": 4.0})
        # Total 4.0 splits 0.75/3.25 (statutory ratio) — never 50/50 (2.0/2.0).
        assert abs(float(st.esi_employee_rate) - 0.75) < 0.001
        assert abs(float(st.esi_employer_rate) - 3.25) < 0.001

    def test_separate_rates_still_win(self, db_session):
        from services.payroll_service import _get_statutory_settings
        org = _org(db_session, "DHS02")
        emp = _emp(db_session, org, "DHS02", datetime(2020, 1, 1))

        st = _get_statutory_settings(db_session, emp, scoped={
            "esiPercent": 4.0, "esiEmployeeRate": 0.9, "esiEmployerRate": 3.6,
        })
        assert float(st.esi_employee_rate) == 0.9
        assert float(st.esi_employer_rate) == 3.6


class TestOvertimeMultiplierChain:
    def test_no_policy_leaves_rate_unset(self, db_session):
        from services.payroll_service import _get_attendance_policy
        org = _org(db_session, "DHO01")
        emp = _emp(db_session, org, "DHO01", datetime(2020, 1, 1))
        policy = _get_attendance_policy(db_session, emp)
        assert policy.overtime_rate is None, (
            "system fallback policy must defer to rule/config resolution"
        )

    def test_published_overtime_rule_supplies_multiplier(self, db_session):
        from services.payroll_service import _overtime_multiplier_from_rules
        from services.statutory_rule_engine import StatutoryRuleEngine

        org = _org(db_session, "DHO02")
        other = _org(db_session, "DHO03")
        db_session.add(StatutoryRule(
            rule_type="overtime", country="India", organization_id=org.id,
            effective_from=date(2026, 1, 1), status="active", version=1,
            definition={"multiplier": 2.0, "threshold_hours": 9.0},
        ))
        db_session.flush()

        engine = StatutoryRuleEngine(db_session)
        as_of = date(2026, 6, 1)
        assert _overtime_multiplier_from_rules(engine, as_of, "India", org.id) == 2.0
        assert _overtime_multiplier_from_rules(engine, as_of, "India", other.id) == 0.0


class TestSettingsEndpointConfigDriven:
    def test_pf_esi_defaults_come_from_statutory_setting(self, db_session, client, admin_token):
        import os
        from models import User
        admin = db_session.query(User).filter(
            User.email == os.getenv("ADMIN_EMAIL", "admin@hrms.com")
        ).first()
        db_session.query(StatutorySetting).filter(
            StatutorySetting.organization_id == admin.organization_id
        ).delete(synchronize_session=False)
        s = StatutorySetting(pf_employee_rate=11.5, esi_employee_rate=1.5,
                             esi_employer_rate=4.5, status="active")
        s.organization_id = admin.organization_id
        db_session.add(s)
        db_session.flush()

        resp = client.get(
            "/api/settings/payroll",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert float(body["pfPercent"]) == 11.5
        assert float(body["esiPercent"]) == 4.5      # employer rate
        assert float(body["esiPercentage"]) == 1.5   # employee rate (was dead 1.75)


class TestRuleEngineEpsCeilingFromConfig:
    def test_missing_eps_ceiling_key_falls_back_to_config(self, db_session):
        from models import StatutoryRuleConfig
        from services.statutory_rule_engine import StatutoryRuleEngine

        org = _org(db_session, "DHP01")
        # Isolate the global config row for this key (rolled back after test).
        db_session.query(StatutoryRuleConfig).filter(
            StatutoryRuleConfig.rule_key == "eps_wage_ceiling",
            StatutoryRuleConfig.organization_id.is_(None),
        ).delete(synchronize_session=False)
        db_session.add(StatutoryRuleConfig(
            organization_id=None, category="pf", rule_key="eps_wage_ceiling",
            label="EPS wage ceiling", current_value=18000.0, unit="money",
            status="active",
        ))
        # Published rule WITHOUT the eps_wage_ceiling key (pre-config shape).
        db_session.add(StatutoryRule(
            rule_type="pf_contribution", country="India", organization_id=org.id,
            effective_from=date(2026, 1, 1), status="active", version=1,
            definition={
                "rate": 12.0, "wage_ceiling": 100000.0, "max_monthly": 99999.0,
                "eps_rate": 8.33, "edli_rate": 0.0, "edli_max": 0.0,
                "admin_rate": 0.0, "admin_min": 0.0,
            },
        ))
        db_session.flush()

        engine = StatutoryRuleEngine(db_session)
        res = engine.calculate_pf(17000, date(2026, 6, 1), "India", None, org.id)
        # min(17000, 18000-config) × 8.33% = 1416.10 (code literal was 15000 → 1249.50)
        assert abs(res["eps"] - 1416.10) < 0.01
