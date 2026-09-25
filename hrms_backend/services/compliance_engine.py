"""
Indian Payroll Compliance Engine
=================================
Calculates PF, ESI, PT, LWF, Gratuity, Bonus, and TDS per employee per month.

This is the core competitive moat against Keka / greytHR / Zoho People.
"""
from typing import Optional
from datetime import date, datetime
from sqlalchemy.orm import Session
from models import (
    Employee, Payroll, StatutorySetting, TaxRegime, TaxSlab, Organization,
    PayrollComponent, PayrollPolicy, SalaryTemplate,
)
from data.state_compliance import PROFESSIONAL_TAX, LWF as LABOUR_WELFARE_FUND


# ── PF Calculation ────────────────────────────────────────────────────────

def calculate_pf(gross_basic: float, setting: StatutorySetting) -> dict:
    """Calculate PF contributions as per Employee Provident Fund & MP Act 1952.
    
    Splits employer contribution into:
      - PF (A/c 1): (employer_rate - eps_rate - edli_rate) of basic
      - EPS (A/c 10): eps_rate% of basic (capped at eps_wage_ceiling)
      - EDLIS (A/c 21): edli_rate% of basic
      - PF Admin (A/c 2): admin_rate% (paid by employer, not deducted from employee)
    
    All rates read from StatutorySetting — fully configurable per company.
    """
    if not setting.pf_applicable:
        return {"employee": 0, "employer": 0, "eps": 0, "edlis": 0, "admin": 0}

    capped_basic = min(gross_basic, setting.pf_min_basic_for_exclusion)
    
    employee_share = round(capped_basic * setting.pf_employee_rate / 100, 2)
    employee_share = min(employee_share, setting.pf_max_monthly)
    
    employer_share = round(capped_basic * setting.pf_employer_rate / 100, 2)
    
    # EPS — read rate and ceiling from DB
    eps_rate = float(getattr(setting, 'eps_rate', None) or 0.0)
    eps_ceiling = float(getattr(setting, 'eps_wage_ceiling', None) or 0.0)
    eps = round(min(capped_basic, eps_ceiling) * eps_rate / 100, 2)
    
    # EDLI — read from DB
    edli_rate = float(getattr(setting, 'pf_edli_rate', None) or 0.0)
    edlis = round(capped_basic * edli_rate / 100, 2)
    
    # Admin — read from DB
    admin_rate = float(getattr(setting, 'pf_admin_rate', None) or 0.0)
    admin = round(capped_basic * admin_rate / 100, 2)
    
    return {
        "employee": employee_share,
        "employer": round(employer_share - eps - edlis, 2),
        "eps": eps,
        "edlis": edlis,
        "admin": admin,
        "total_employer": employer_share,
    }


# ── ESI Calculation ───────────────────────────────────────────────────────

def calculate_esi(gross_salary: float, setting: StatutorySetting) -> dict:
    """Calculate ESI as per ESI Act 1948.
    
    Employee: 0.75% of gross wages
    Employer: 3.25% of gross wages
    Applicable for gross wages <= ₹21,000/month (₹25,000 for persons with disability)
    """
    if not setting.esi_applicable or gross_salary > setting.esi_gross_ceiling:
        return {"employee": 0, "employer": 0}

    return {
        "employee": round(gross_salary * setting.esi_employee_rate / 100, 2),
        "employer": round(gross_salary * setting.esi_employer_rate / 100, 2),
    }


# ── Professional Tax ──────────────────────────────────────────────────────

def _resolve_state_key(state_code: Optional[str]) -> Optional[str]:
    """Resolve a state code/name to the internal snake_case key used by the DB
    tables and the static defaults (e.g. 'KA' -> 'karnataka')."""
    if not state_code:
        return None
    from data.state_compliance import resolve_state_key as _rs
    return _rs(state_code)


def _pt_rows_from_db(db, state_key: str, as_of) -> Optional[list]:
    """Return effective-dated PT slabs for a state, or None to fall back to static."""
    try:
        from models import StatePTSlab
        q = (
            db.query(StatePTSlab)
            .filter(StatePTSlab.state_code == state_key)
            .filter(StatePTSlab.effective_from <= as_of)
            .filter(
                (StatePTSlab.effective_to.is_(None)) | (StatePTSlab.effective_to >= as_of)
            )
            .order_by(StatePTSlab.from_gross.asc())
            .all()
        )
        return q if q else None
    except Exception:
        return None


def calculate_professional_tax(
    gross_salary: float,
    state_code: Optional[str],
    db: Session = None,
    as_of=None,
) -> dict:
    """Calculate Professional Tax based on state-wise slabs.

    Uses the effective-dated DB slabs (StatePTSlab) when present for the period;
    otherwise falls back to the static table in data/state_compliance.py.
    """
    if not state_code:
        return {"amount": 0, "state": None}

    state_key = _resolve_state_key(state_code)
    if not state_key:
        return {"amount": 0, "state": state_code}

    as_of = as_of or datetime.utcnow().date()

    if db is not None:
        rows = _pt_rows_from_db(db, state_key, as_of)
        if rows is not None:
            for slab in rows:
                if slab.from_gross <= gross_salary:
                    if slab.to_gross is None or gross_salary <= slab.to_gross:
                        return {"amount": float(slab.amount), "state": slab.state_name or state_key, "source": "db"}
            return {"amount": 0.0, "state": (rows[0].state_name if rows else state_key) or state_key, "source": "db"}

    state_data = PROFESSIONAL_TAX.get(state_key)
    if not state_data:
        return {"amount": 0, "state": state_code}

    for slab in state_data["slabs"]:
        if slab["from_gross"] <= gross_salary:
            if slab["to_gross"] is None or gross_salary <= slab["to_gross"]:
                return {"amount": slab["amount"], "state": state_data["state_name"], "source": "static"}

    return {"amount": 0, "state": state_data["state_name"], "source": "static"}


# ── LWF Calculation ───────────────────────────────────────────────────────

def _lwf_row_from_db(db, state_key: str, as_of) -> Optional[object]:
    """Return the effective-dated LWF config for a state, or None to fall back to static."""
    try:
        from models import StateLWFConfig
        return (
            db.query(StateLWFConfig)
            .filter(StateLWFConfig.state_code == state_key)
            .filter(StateLWFConfig.effective_from <= as_of)
            .filter(
                (StateLWFConfig.effective_to.is_(None)) | (StateLWFConfig.effective_to >= as_of)
            )
            .order_by(StateLWFConfig.effective_from.desc())
            .first()
        )
    except Exception:
        return None


def calculate_lwf(
    gross_salary: float,
    state_code: Optional[str],
    db: Session = None,
    as_of=None,
) -> dict:
    """Calculate Labour Welfare Fund based on state contribution rules.

    LWF amounts are fixed per state (not percentage-based), e.g.:
      - Karnataka: Employee ₹20/mo, Employer ₹40/mo
      - Maharashtra: Employee ₹12/mo, Employer ₹24/mo
    Applicable only if gross salary <= state's max_wage_for_applicability.

    Uses the effective-dated DB config (StateLWFConfig) when present for the
    period; otherwise falls back to the static table.
    """
    if not state_code:
        return {"employee": 0, "employer": 0, "state": None}

    state_key = _resolve_state_key(state_code)
    if not state_key:
        return {"employee": 0, "employer": 0, "state": state_code}

    as_of = as_of or datetime.utcnow().date()

    if db is not None:
        row = _lwf_row_from_db(db, state_key, as_of)
        if row is not None:
            if not row.applicable:
                return {"employee": 0, "employer": 0, "applicable": False, "state": row.state_name or state_key, "source": "db"}
            max_wage = row.max_wage_for_applicability
            if max_wage and gross_salary > max_wage:
                return {"employee": 0, "employer": 0, "applicable": False, "state": row.state_name or state_key, "source": "db"}
            emp_contrib = float(row.employee_contribution or 0)
            employer_contrib = float(row.employer_contribution or 0)
            frequency = row.frequency or "monthly"
            if frequency == "half_yearly":
                emp_contrib = round(emp_contrib / 6, 2)
                employer_contrib = round(employer_contrib / 6, 2)
            return {
                "employee": emp_contrib,
                "employer": employer_contrib,
                "applicable": True,
                "state": row.state_name or state_key,
                "frequency": frequency,
                "source": "db",
            }

    state_data = LABOUR_WELFARE_FUND.get(state_key)
    if not state_data or not state_data.get("applicable", False):
        return {"employee": 0, "employer": 0, "state": state_code}

    max_wage = state_data.get("max_wage_for_applicability", 0)
    if max_wage and gross_salary > max_wage:
        return {"employee": 0, "employer": 0, "state": state_data.get("state_name")}

    emp_contrib = state_data.get("employee_contribution", 0)
    employer_contrib = state_data.get("employer_contribution", 0)
    frequency = state_data.get("frequency", "monthly")

    # Convert half-yearly to monthly
    if frequency == "half_yearly":
        emp_contrib = round(emp_contrib / 6, 2)
        employer_contrib = round(employer_contrib / 6, 2)

    return {
        "employee": emp_contrib,
        "employer": employer_contrib,
        "state": state_data.get("state_name", state_code),
        "frequency": frequency,
        "source": "static",
    }


# ── Gratuity ──────────────────────────────────────────────────────────────

def calculate_gratuity(basic_da: float, years_of_service: int, setting: Optional[StatutorySetting] = None) -> dict:
    """Calculate gratuity as per Payment of Gratuity Act 1972.
    
    Formula: (days_per_year * last_drawn_basic_da * years_of_service) / 26
    Cap: configurable (default ₹20,00,000 tax-free limit)
    Eligibility: configurable (default 5 years)
    
    All parameters read from StatutorySetting — fully configurable per company.
    """
    eligible_years = float(getattr(setting, 'gratuity_eligible_years', None) or 0.0) if setting else 0.0
    days_per_year = float(getattr(setting, 'gratuity_days_per_year', None) or 0.0) if setting else 0.0
    tax_exempt_ceiling = float(getattr(setting, 'gratuity_tax_exempt_ceiling', None) or 0.0) if setting else 0.0
    
    if years_of_service < eligible_years:
        return {"amount": 0, "eligible": False, "years_of_service": years_of_service}
    
    amount = (days_per_year * basic_da * years_of_service) / 26
    return {
        "amount": round(min(amount, tax_exempt_ceiling), 2),
        "eligible": True,
        "years_of_service": years_of_service,
        "capped": amount > tax_exempt_ceiling,
    }


# ── Bonus Calculation ─────────────────────────────────────────────────────

def calculate_bonus(gross_salary: float, months_worked: int) -> dict:
    """Calculate bonus as per Payment of Bonus Act 1965.
    
    Minimum bonus: 8.33% of salary
    Maximum bonus: 20% of salary
    Applicable for salary <= ₹21,000/month
    """
    if gross_salary > 21000:
        return {"amount": 0, "minimum": 0, "maximum": 0, "eligible": False}
    
    annual_salary = gross_salary * months_worked
    min_bonus = round(annual_salary * 8.33 / 100, 2)
    max_bonus = round(annual_salary * 20 / 100, 2)
    
    return {
        "minimum": min_bonus,
        "maximum": max_bonus,
        "eligible": True,
        "months_worked": months_worked,
    }


# ── Income Tax / TDS Calculation ──────────────────────────────────────────

def calculate_income_tax(annual_gross: float, regime: TaxRegime, slabs: list[TaxSlab],
                         deductions_80c: float = 0, deductions_80d: float = 0,
                         hra_exemption: float = 0, lta_exemption: float = 0,
                         nps_deduction: float = 0, home_loan_interest: float = 0) -> dict:
    """Calculate income tax under Old or New tax regime.
    
    New Regime (default since FY 2023-24):
      - No deductions allowed (except standard deduction ₹50,000)
      - Lower slab rates
    Old Regime:
      - Allows 80C (₹1.5L max), 80D, HRA, LTA, NPS, home loan interest
      - Higher slab rates
    """
    std_deduction = regime.standard_deduction
    taxable_income = annual_gross - std_deduction
    
    if regime.regime_type == "new":
        # New regime: no deductions except standard deduction
        pass
    else:
        # Old regime: allow deductions — all caps read from TaxRegime
        cap_80c = float(getattr(regime, 'section_80c_old_cap', None) or 0)
        cap_80d = float(getattr(regime, 'section_80d_cap', None) or 0)
        cap_nps = float(getattr(regime, 'section_80ccd_1b_cap', None) or 0)
        cap_home_loan = float(getattr(regime, 'section_24_home_loan_cap', None) or 0)
        taxable_income -= min(deductions_80c, cap_80c)
        taxable_income -= min(deductions_80d, cap_80d)
        taxable_income -= hra_exemption
        taxable_income -= lta_exemption
        taxable_income -= min(nps_deduction, cap_nps)
        taxable_income -= min(home_loan_interest, cap_home_loan)
    
    taxable_income = max(taxable_income, 0)
    
    # Apply rebate (87A)
    tax = 0
    for slab in sorted(slabs, key=lambda s: s.from_amount):
        if taxable_income <= slab.from_amount:
            break
        slab_max = slab.to_amount if slab.to_amount else taxable_income
        slab_income = min(taxable_income, slab_max) - slab.from_amount
        if slab_income > 0:
            tax += slab_income * slab.rate / 100
    
    # Rebate u/s 87A
    if taxable_income <= regime.rebate_threshold and regime.rebate_amount > 0:
        tax = max(0, tax - regime.rebate_amount)
    
    # Surcharge — read threshold from surcharge_config or use regime settings
    surcharge = 0
    if regime.surcharge_config:
        for s_slab in regime.surcharge_config:
            if taxable_income >= s_slab["from"]:
                surcharge = tax * s_slab["rate"] / 100
    
    # Health & Education Cess
    cess = (tax + surcharge) * regime.cess_rate / 100
    
    total_tax = round(tax + surcharge + cess, 2)
    monthly_tds = round(total_tax / 12, 2)
    
    return {
        "annual_gross": annual_gross,
        "standard_deduction": std_deduction,
        "taxable_income": round(taxable_income, 2),
        "tax": round(tax, 2),
        "surcharge": round(surcharge, 2),
        "cess": round(cess, 2),
        "total_tax": total_tax,
        "monthly_tds": monthly_tds,
        "effective_tax_rate": round(total_tax / annual_gross * 100, 2) if annual_gross > 0 else 0,
        "regime_type": regime.regime_type,
    }


# ── Full Payroll Processing ───────────────────────────────────────────────

def _compute_salary_components(
    db: Session, employee: Employee, org: Organization, policy_id: Optional[int] = None
) -> dict:
    """Compute earnings from org-defined PayrollComponent records.
    
    Each organization defines their own salary components with:
      - calculation_type: 'percentage' or 'fixed'
      - calculation_base: 'basic', 'gross', 'ctc', or None for fixed
      - calculation_value: the percentage or fixed amount
      - max_cap / min_cap: optional limits
    """
    policy_id = policy_id or employee.payroll_policy_id or org.default_payroll_policy_id
    query = db.query(PayrollComponent).filter(
        PayrollComponent.organization_id == org.id,
        PayrollComponent.is_active == True,
        PayrollComponent.component_type == "earning",
    )
    if policy_id:
        query = query.filter(
            (PayrollComponent.payroll_policy_id == policy_id) |
            (PayrollComponent.payroll_policy_id.is_(None))
        )
    components = query.order_by(PayrollComponent.priority).all()

    base_salary = employee.base_salary or 0
    computed = {}
    total_earnings = 0.0

    for comp in components:
        value = 0.0
        if comp.calculation_type == "percentage":
            base_value = base_salary
            if comp.calculation_base == "basic":
                # Use the computed "basic" if available, otherwise use base_salary directly
                base_value = computed.get("basic", base_salary)
            elif comp.calculation_base == "ctc":
                base_value = base_salary
            value = base_value * comp.calculation_value / 100
        else:
            value = comp.calculation_value

        if comp.max_cap:
            value = min(value, comp.max_cap)
        if comp.min_cap:
            value = max(value, comp.min_cap)

        computed[comp.name] = round(value, 2)
        total_earnings += value

    # Fallback if no components defined: basic = base_salary, everything else = 0
    if not computed:
        basic = round(base_salary, 2)
        computed = {
            "basic": basic,
        }
        total_earnings = sum(computed.values())

    return {"components": computed, "gross": round(total_earnings, 2)}


def process_monthly_payroll(
    db: Session,
    employee_id: int,
    month: int,
    year: int,
    attendance_data: Optional[dict] = None,
) -> dict:
    """Process full payroll for one employee for one month.
    
    Uses org-configured:
      - PayrollComponent records for earnings structure
      - StatutorySetting for PF, ESI, PT, LWF, Gratuity rates
      - TaxRegime + TaxSlab for TDS
      - Organization's registered_state for state-specific PT/LWF
    """
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise ValueError(f"Employee {employee_id} not found")

    org = db.query(Organization).filter(Organization.id == employee.organization_id).first()
    if not org:
        raise ValueError(f"Organization not found for employee {employee_id}")

    # ── Load org-level configurations ──
    setting = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == employee.organization_id
    ).first()
    if not setting:
        raise ValueError(f"Statutory settings not configured for org {employee.organization_id}. "
                         "Configure at /api/payroll-config/statutory-settings")

    state_code = org.registered_state.lower().replace(" ", "_") if org.registered_state else None

    # Payroll-period date for effective-dated state slab lookups (first day of the month).
    try:
        period_date = date(year, month, 1)
    except Exception:
        period_date = date.today()

    # ── Earnings from org-defined PayrollComponent records ──
    salary_result = _compute_salary_components(db, employee, org)
    components = salary_result["components"]
    gross = salary_result["gross"]

    # Extract basic for PF calculation (use component "basic" or 50% of gross)
    basic = components.get("basic", gross * 0.5)

    # ── Statutory deductions (rates from StatutorySetting in DB) ──
    pf = calculate_pf(basic, setting)
    esi = calculate_esi(gross, setting)
    pt = calculate_professional_tax(gross, state_code, db=db, as_of=period_date)
    lwf = calculate_lwf(gross, state_code, db=db, as_of=period_date)

    # ── TDS from org-defined TaxRegime + TaxSlab ──
    tax_regime = None
    if employee.tax_regime_id:
        tax_regime = db.query(TaxRegime).filter(TaxRegime.id == employee.tax_regime_id).first()
    if not tax_regime:
        tax_regime = db.query(TaxRegime).filter(
            TaxRegime.organization_id == employee.organization_id,
            TaxRegime.is_default == True,
        ).first()

    tds = 0
    if tax_regime:
        slabs = db.query(TaxSlab).filter(
            TaxSlab.tax_regime_id == tax_regime.id
        ).order_by(TaxSlab.from_amount).all()
        annual_gross = gross * 12
        tax_result = calculate_income_tax(annual_gross, tax_regime, slabs)
        tds = tax_result["monthly_tds"]

    total_statutory = pf["employee"] + esi["employee"] + pt["amount"] + lwf["employee"]
    total_deductions = total_statutory + tds
    net_salary = max(0, gross - total_deductions)

    return {
        "employee_id": employee_id,
        "month": month,
        "year": year,
        "salary_components": components,
        "gross_salary": round(gross, 2),
        "pf_employee": pf["employee"],
        "pf_employer": pf["employer"],
        "pf_eps": pf["eps"],
        "pf_edlis": pf["edlis"],
        "esi_employee": esi["employee"],
        "esi_employer": esi["employer"],
        "professional_tax": pt["amount"],
        "lwf_employee": lwf["employee"],
        "lwf_employer": lwf["employer"],
        "tds": tds,
        "total_statutory_deductions": round(total_statutory, 2),
        "total_deductions": round(total_deductions, 2),
        "net_salary": round(net_salary, 2),
        "state": org.registered_state,
        "data_source": "org_configured",
        "note": "All rates sourced from your org's PayrollConfig. Adjust at /api/payroll-config/*",
    }


def generate_payslip_pdf(payroll_data: dict) -> dict:
    """Generate payslip PDF with all compliance details.
    
    Returns a stub — production version would use ReportLab / WeasyPrint
    to generate a proper Indian-format payslip with:
      - Company logo & details
      - Employee details (UAN, ESIC, PAN)
      - Earnings table (Basic, HRA, Conveyance, Medical, Special, Gross)
      - Deductions table (PF, ESI, PT, LWF, TDS, Total)
      - Net Pay (in words)
      - Compliance summary (PF Wages, EPS Wages, EDLIS, Admin Charges)
    """
    return {
        "payslip_ready": True,
        "format": "pdf_stub",
        "note": "Production PDF generation requires ReportLab/WeasyPrint",
    }
