"""
Payroll Configuration Router
=============================
CRUD endpoints for per-organization customizable payroll policies,
components, statutory settings, tax regimes, attendance policies,
and one-click industry template application.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.auth import check_role, get_current_user
from core.company_scope import resolve_company_scope, assert_company_allowed, require_write_company
from data.state_compliance import (
    PROFESSIONAL_TAX, LWF, get_all_state_codes, get_lwf_state_codes,
    get_pt_for_state, get_lwf_for_state, resolve_state_key,
)
from database import get_db
from models import (
    AttendancePolicy,
    Employee,
    Organization,
    PayrollComponent,
    PayrollPolicy,
    StatutorySetting,
    TaxRegime,
    TaxSlab,
    User,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/payroll-config", tags=["Payroll Configuration"])


def _company_id(companyId: Optional[int] = None) -> Optional[int]:
    """Extract company_id from query param. None means org-wide."""
    return companyId


def _derive_working_days(per_week: Optional[int], explicit: Optional[str] = None) -> str:
    """Derive the comma-separated workweek day-set from working_days_per_week.

    Days are 0=Sun ... 6=Sat. Unless an explicit set is given, the first N days
    starting from Monday are treated as working days (e.g. 6 -> "1,2,3,4,5,6",
    7 -> "0,1,2,3,4,5,6" for a 7-day / works-every-day schedule).
    """
    if explicit and str(explicit).strip():
        return str(explicit).strip()
    n = int(per_week or 6)
    n = min(7, max(0, n))
    order = [1, 2, 3, 4, 5, 6, 0]  # Mon..Sun
    return ",".join(str(order[i]) for i in range(n))


# ── Pydantic Schemas ──

class PayrollPolicyCreate(BaseModel):
    name: str = "Default Payroll Policy"
    company_id: Optional[int] = None
    pro_ration_method: str = "paid_days"
    rounding_method: str = "nearest"
    decimal_places: int = 2
    round_net_salary: bool = True
    include_gratuity: bool = False
    gratuity_rate: float = 4.81
    default_currency: str = "INR"
    allow_negative_net: bool = False
    daily_rate_divisor: float = 30.0
    monthly_divisor_for_weekly: float = 4.33
    fy_start_month: int = 4
    reporting_currency: Optional[str] = None
    allow_multi_currency: bool = False

class PayrollPolicyUpdate(BaseModel):
    name: Optional[str] = None
    company_id: Optional[int] = None
    pro_ration_method: Optional[str] = None
    rounding_method: Optional[str] = None
    decimal_places: Optional[int] = None
    round_net_salary: Optional[bool] = None
    include_gratuity: Optional[bool] = None
    gratuity_rate: Optional[float] = None
    default_currency: Optional[str] = None
    allow_negative_net: Optional[bool] = None
    daily_rate_divisor: Optional[float] = None
    monthly_divisor_for_weekly: Optional[float] = None
    fy_start_month: Optional[int] = None
    reporting_currency: Optional[str] = None
    allow_multi_currency: Optional[bool] = None

class PayrollComponentCreate(BaseModel):
    payroll_policy_id: Optional[int] = None
    name: str
    display_name: Optional[str] = None
    component_type: str = "earning"
    calculation_type: str = "percentage"
    calculation_base: Optional[str] = "basic"
    calculation_value: float = 0
    formula: Optional[str] = None
    max_cap: Optional[float] = None
    min_cap: Optional[float] = None
    is_statutory: bool = False
    is_taxable: bool = True
    is_tax_exempt: bool = False
    tax_exempt_limit: Optional[float] = None
    apply_pro_ration: bool = True
    is_active: bool = True
    priority: int = 0

class PayrollComponentUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    component_type: Optional[str] = None
    calculation_type: Optional[str] = None
    calculation_base: Optional[str] = None
    calculation_value: Optional[float] = None
    formula: Optional[str] = None
    max_cap: Optional[float] = None
    min_cap: Optional[float] = None
    is_statutory: Optional[bool] = None
    is_taxable: Optional[bool] = None
    is_tax_exempt: Optional[bool] = None
    tax_exempt_limit: Optional[float] = None
    apply_pro_ration: Optional[bool] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None

class StatutorySettingCreate(BaseModel):
    pf_applicable: bool = True
    pf_employee_rate: float = 12.0
    pf_employer_rate: float = 3.67
    pf_wage_ceiling: float = 15000.0
    pf_max_monthly: float = 1800.0
    pf_min_basic_for_exclusion: float = 15000.0
    pf_edli_rate: float = 0.5
    pf_edli_max_monthly: float = 75.0
    pf_admin_rate: float = 0.5
    pf_admin_min_monthly: float = 75.0
    eps_wage_ceiling: float = 15000.0
    esi_applicable: bool = True
    esi_employee_rate: float = 0.75
    esi_employer_rate: float = 3.25
    esi_gross_ceiling: float = 21000.0
    esi_disabled_ceiling: float = 25000.0
    pt_applicable: bool = True
    pt_monthly_amount: float = 200.0
    pt_min_gross: float = 10000.0
    lwf_applicable: bool = False
    lwf_employee_rate: float = 0.0
    lwf_employer_rate: float = 0.0
    gratuity_applicable: bool = False
    gratuity_rate: float = 4.81
    gratuity_eligible_years: float = 5.0
    gratuity_days_per_year: float = 15.0
    gratuity_tax_exempt_ceiling: float = 2000000.0
    bonus_applicable: bool = False
    bonus_min_rate: float = 8.33
    bonus_max_rate: float = 20.0
    bonus_wage_ceiling: float = 21000.0

class StatutorySettingUpdate(BaseModel):
    pf_applicable: Optional[bool] = None
    pf_employee_rate: Optional[float] = None
    pf_employer_rate: Optional[float] = None
    pf_wage_ceiling: Optional[float] = None
    pf_max_monthly: Optional[float] = None
    pf_min_basic_for_exclusion: Optional[float] = None
    pf_edli_rate: Optional[float] = None
    pf_edli_max_monthly: Optional[float] = None
    pf_admin_rate: Optional[float] = None
    pf_admin_min_monthly: Optional[float] = None
    eps_wage_ceiling: Optional[float] = None
    eps_employer_rate: Optional[float] = None
    nps_employee_rate: Optional[float] = None
    nps_employer_rate: Optional[float] = None
    esi_applicable: Optional[bool] = None
    esi_employee_rate: Optional[float] = None
    esi_employer_rate: Optional[float] = None
    esi_gross_ceiling: Optional[float] = None
    esi_disabled_ceiling: Optional[float] = None
    pt_applicable: Optional[bool] = None
    pt_monthly_amount: Optional[float] = None
    pt_min_gross: Optional[float] = None
    lwf_applicable: Optional[bool] = None
    lwf_employee_rate: Optional[float] = None
    lwf_employer_rate: Optional[float] = None
    gratuity_applicable: Optional[bool] = None
    gratuity_rate: Optional[float] = None
    gratuity_eligible_years: Optional[float] = None
    gratuity_days_per_year: Optional[float] = None
    gratuity_tax_exempt_ceiling: Optional[float] = None
    bonus_applicable: Optional[bool] = None
    bonus_min_rate: Optional[float] = None
    bonus_max_rate: Optional[float] = None
    bonus_eligible_ceiling: Optional[float] = None
    bonus_wage_ceiling: Optional[float] = None

class TaxSlabSchema(BaseModel):
    from_amount: float
    to_amount: Optional[float] = None
    rate: float
    sort_order: int = 0

class TaxRegimeCreate(BaseModel):
    name: str
    regime_type: str = "new"
    is_active: bool = True
    is_default: bool = False
    financial_year: str = "2025-26"
    standard_deduction: float = 50000.0
    rebate_threshold: float = 700000.0
    rebate_amount: float = 0.0
    cess_rate: float = 4.0
    surcharge_config: Optional[List[Dict[str, Any]]] = None
    slabs: List[TaxSlabSchema] = []

class TaxRegimeUpdate(BaseModel):
    name: Optional[str] = None
    regime_type: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    financial_year: Optional[str] = None
    standard_deduction: Optional[float] = None
    rebate_threshold: Optional[float] = None
    rebate_amount: Optional[float] = None
    cess_rate: Optional[float] = None
    surcharge_config: Optional[List[Dict[str, Any]]] = None

class AttendancePolicyCreate(BaseModel):
    name: str = "Default Attendance Policy"
    description: Optional[str] = None
    status: Optional[str] = None
    working_days_per_week: Optional[int] = 6
    working_days: str = "0,1,2,3,4,5,6"
    half_day_as_full_paid: bool = True
    paid_leave_as_present: bool = True
    holiday_as_present: bool = True
    overtime_threshold_hours: Optional[float] = 8.0
    overtime_rate: Optional[float] = 1.5
    overtime_tiers: Optional[list] = None
    shift_differential_rates: Optional[dict] = None
    late_mark_threshold_minutes: Optional[int] = 15
    half_day_threshold_hours: Optional[float] = 4.0
    wfh_allowed: bool = False
    geofence_enabled: bool = False
    geofence_radius: Optional[float] = 100.0
    effective_from: Optional[str] = None
    shift_id: Optional[int] = None
    late_to_absent_count: Optional[int] = None
    early_to_absent_count: Optional[int] = None
    missing_checkout_rule: Optional[str] = None
    company_id: Optional[int] = None
    check_in_time: Optional[str] = "09:00"
    check_out_time: Optional[str] = "18:00"
    break_hours: Optional[float] = 1.0
    comp_off_enabled: bool = False
    max_comp_off_balance: Optional[int] = 5
    max_overtime_hours_per_month: Optional[float] = None
    selfie_checkin_enabled: bool = False
    ip_restriction_enabled: bool = False
    allowed_ip_ranges: Optional[list] = None
    wifi_checkin_enabled: bool = False
    allowed_ssids: Optional[list] = None
    auto_approve_if_no_mark: bool = False
    min_hours_for_full_day: Optional[float] = 8.0
    shift_based_payroll: bool = False

class AttendancePolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    working_days_per_week: Optional[int] = None
    working_days: Optional[str] = None
    half_day_as_full_paid: Optional[bool] = None
    paid_leave_as_present: Optional[bool] = None
    holiday_as_present: Optional[bool] = None
    overtime_threshold_hours: Optional[float] = None
    overtime_rate: Optional[float] = None
    overtime_tiers: Optional[list] = None
    shift_differential_rates: Optional[dict] = None
    late_mark_threshold_minutes: Optional[int] = None
    half_day_threshold_hours: Optional[float] = None
    wfh_allowed: Optional[bool] = None
    geofence_enabled: Optional[bool] = None
    geofence_radius: Optional[float] = None
    effective_from: Optional[str] = None
    shift_id: Optional[int] = None
    late_to_absent_count: Optional[int] = None
    early_to_absent_count: Optional[int] = None
    missing_checkout_rule: Optional[str] = None
    company_id: Optional[int] = None
    check_in_time: Optional[str] = None
    check_out_time: Optional[str] = None
    break_hours: Optional[float] = None
    comp_off_enabled: Optional[bool] = None
    max_comp_off_balance: Optional[int] = None
    max_overtime_hours_per_month: Optional[float] = None
    selfie_checkin_enabled: Optional[bool] = None
    ip_restriction_enabled: Optional[bool] = None
    allowed_ip_ranges: Optional[list] = None
    wifi_checkin_enabled: Optional[bool] = None
    allowed_ssids: Optional[list] = None
    auto_approve_if_no_mark: Optional[bool] = None
    min_hours_for_full_day: Optional[float] = None
    shift_based_payroll: Optional[bool] = None


# ── Dependency ──

def _get_org(db: Session, user: User) -> Organization:
    org = db.query(Organization).filter(Organization.id == user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


# ════════════════════════════════════════════════════════════════
# Payroll Policy
# ════════════════════════════════════════════════════════════════

@router.get("/policies", response_model=List[dict])
def list_policies(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(PayrollPolicy).filter(
        PayrollPolicy.organization_id == current_user.organization_id,
        PayrollPolicy.status != "inactive",
    )
    if companyId is not None:
        q = q.filter(PayrollPolicy.company_id == companyId)
    policies = q.order_by(PayrollPolicy.id).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "company_id": p.company_id,
            "pro_ration_method": p.pro_ration_method,
            "rounding_method": p.rounding_method,
            "decimal_places": p.decimal_places,
            "include_gratuity": p.include_gratuity,
            "gratuity_rate": p.gratuity_rate,
            "default_currency": p.default_currency,
            "status": p.status,
        }
        for p in policies
    ]

@router.post("/policies", status_code=201)
def create_policy(
    data: PayrollPolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = _get_org(db, current_user)
    policy = PayrollPolicy(organization_id=org.id, company_id=data.company_id, **{k: v for k, v in data.model_dump().items() if k != 'company_id'})
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return {"message": "Payroll policy created", "id": policy.id}

@router.put("/policies/{policy_id}")
def update_policy(
    policy_id: int,
    data: PayrollPolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    policy = db.query(PayrollPolicy).filter(
        PayrollPolicy.id == policy_id,
        PayrollPolicy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Payroll policy not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    for k, v in updates.items():
        setattr(policy, k, v)
    db.commit()
    return {"message": "Payroll policy updated"}

@router.delete("/policies/{policy_id}")
def delete_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    policy = db.query(PayrollPolicy).filter(
        PayrollPolicy.id == policy_id,
        PayrollPolicy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Payroll policy not found")
    policy.status = "inactive"
    db.commit()
    return {"message": "Payroll policy deactivated"}


# ════════════════════════════════════════════════════════════════
# Payroll Components
# ════════════════════════════════════════════════════════════════

@router.get("/components", response_model=List[dict])
def list_components(
    policy_id: Optional[int] = None,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(PayrollComponent).filter(
        PayrollComponent.organization_id == current_user.organization_id,
        PayrollComponent.status != "inactive",
    )
    if companyId is not None:
        query = query.filter(PayrollComponent.company_id == companyId)
    if policy_id:
        query = query.filter(PayrollComponent.payroll_policy_id == policy_id)
    components = query.order_by(PayrollComponent.priority).all()
    return [
        {
            "id": c.id,
            "payroll_policy_id": c.payroll_policy_id,
            "company_id": c.company_id,
            "name": c.name,
            "display_name": c.display_name or c.name,
            "component_type": c.component_type,
            "calculation_type": c.calculation_type,
            "calculation_base": c.calculation_base,
            "calculation_value": c.calculation_value,
            "max_cap": c.max_cap,
            "min_cap": c.min_cap,
            "is_statutory": c.is_statutory,
            "is_taxable": c.is_taxable,
            "is_tax_exempt": c.is_tax_exempt,
            "apply_pro_ration": c.apply_pro_ration,
            "is_active": c.is_active,
            "priority": c.priority,
        }
        for c in components
    ]

@router.post("/components", status_code=201)
def create_component(
    data: PayrollComponentCreate,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    policy_id = data.payroll_policy_id
    if policy_id is None:
        q = db.query(PayrollPolicy).filter(
            PayrollPolicy.organization_id == current_user.organization_id,
            PayrollPolicy.status == "active",
        )
        if companyId is not None:
            q = q.filter(PayrollPolicy.company_id == companyId)
        default_policy = q.order_by(PayrollPolicy.id).first()
        if default_policy:
            policy_id = default_policy.id
        else:
            default_policy = PayrollPolicy(
                organization_id=current_user.organization_id,
                company_id=companyId,
                name="Default Payroll Policy",
                status="active",
            )
            db.add(default_policy)
            db.flush()
            policy_id = default_policy.id

    policy = db.query(PayrollPolicy).filter(
        PayrollPolicy.id == policy_id,
        PayrollPolicy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Payroll policy not found")
    payload = data.model_dump()
    payload["payroll_policy_id"] = policy_id
    payload["company_id"] = companyId or policy.company_id
    comp = PayrollComponent(organization_id=current_user.organization_id, **payload)
    db.add(comp)
    db.commit()
    db.refresh(comp)
    return {"message": "Component created", "id": comp.id}

@router.put("/components/{component_id}")
def update_component(
    component_id: int,
    data: PayrollComponentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = db.query(PayrollComponent).filter(
        PayrollComponent.id == component_id,
        PayrollComponent.organization_id == current_user.organization_id,
    ).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Component not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    for k, v in updates.items():
        setattr(comp, k, v)
    db.commit()
    return {"message": "Component updated"}

@router.delete("/components/{component_id}")
def delete_component(
    component_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comp = db.query(PayrollComponent).filter(
        PayrollComponent.id == component_id,
        PayrollComponent.organization_id == current_user.organization_id,
    ).first()
    if not comp:
        raise HTTPException(status_code=404, detail="Component not found")
    if comp.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system components")
    comp.is_active = False
    comp.status = "inactive"
    db.commit()
    return {"message": "Component deactivated"}


# ════════════════════════════════════════════════════════════════
# Statutory Settings
# ════════════════════════════════════════════════════════════════

@router.get("/statutory-settings")
def get_statutory_settings(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == current_user.organization_id,
    )
    if companyId is not None:
        q = q.filter(StatutorySetting.company_id == companyId)
    setting = q.first()
    if not setting:
        return {
            "id": None,
            "organization_id": current_user.organization_id,
            "company_id": companyId,
            "message": "No custom settings configured. Defaults apply.",
        }
    return {
        "id": setting.id,
        "company_id": setting.company_id,
        "pf_applicable": setting.pf_applicable,
        "pf_employee_rate": setting.pf_employee_rate,
        "pf_employer_rate": setting.pf_employer_rate,
        "pf_max_monthly": setting.pf_max_monthly,
        "pf_min_basic_for_exclusion": setting.pf_min_basic_for_exclusion,
        "pf_wage_ceiling": setting.pf_wage_ceiling,
        "pf_edli_rate": setting.pf_edli_rate,
        "pf_edli_max_monthly": setting.pf_edli_max_monthly,
        "pf_admin_rate": setting.pf_admin_rate,
        "pf_admin_min_monthly": setting.pf_admin_min_monthly,
        "eps_wage_ceiling": setting.eps_wage_ceiling,
        "eps_employer_rate": setting.eps_employer_rate,
        "nps_employee_rate": setting.nps_employee_rate,
        "nps_employer_rate": setting.nps_employer_rate,
        "esi_applicable": setting.esi_applicable,
        "esi_employee_rate": setting.esi_employee_rate,
        "esi_employer_rate": setting.esi_employer_rate,
        "esi_gross_ceiling": setting.esi_gross_ceiling,
        "esi_disabled_ceiling": setting.esi_disabled_ceiling,
        "pt_applicable": setting.pt_applicable,
        "pt_monthly_amount": setting.pt_monthly_amount,
        "pt_min_gross": setting.pt_min_gross,
        "lwf_applicable": setting.lwf_applicable,
        "lwf_employee_rate": setting.lwf_employee_rate,
        "lwf_employer_rate": setting.lwf_employer_rate,
        "gratuity_applicable": setting.gratuity_applicable,
        "gratuity_rate": setting.gratuity_rate,
        "gratuity_eligible_years": setting.gratuity_eligible_years,
        "gratuity_days_per_year": setting.gratuity_days_per_year,
        "gratuity_tax_exempt_ceiling": setting.gratuity_tax_exempt_ceiling,
        "bonus_applicable": setting.bonus_applicable,
        "bonus_min_rate": setting.bonus_min_rate,
        "bonus_max_rate": setting.bonus_max_rate,
        "bonus_eligible_ceiling": setting.bonus_eligible_ceiling,
        "bonus_wage_ceiling": setting.bonus_wage_ceiling,
    }

@router.put("/statutory-settings")
def upsert_statutory_settings(
    data: StatutorySettingUpdate,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for name, val in data.model_dump().items():
        if isinstance(val, (int, float)) and not isinstance(val, bool) and val < 0:
            raise HTTPException(status_code=400, detail=f"{name} cannot be negative")
    q = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == current_user.organization_id,
    )
    if companyId is not None:
        q = q.filter(StatutorySetting.company_id == companyId)
    setting = q.first()
    if setting:
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        for k, v in updates.items():
            setattr(setting, k, v)
    else:
        setting = StatutorySetting(
            organization_id=current_user.organization_id,
            company_id=companyId,
            **{k: v for k, v in data.model_dump().items() if v is not None},
        )
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return {"message": "Statutory settings updated", "id": setting.id}


@router.delete("/statutory-settings")
def delete_statutory_settings(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == current_user.organization_id,
    )
    if companyId is not None:
        q = q.filter(StatutorySetting.company_id == companyId)
    setting = q.first()
    if not setting:
        raise HTTPException(status_code=404, detail="No statutory settings found")
    db.delete(setting)
    db.commit()
    return {"message": "Statutory settings deleted"}


# Country-specific statutory presets. The engine is country-agnostic; these are
# sensible one-click starting points (always fine-tunable via the PUT endpoint).
COUNTRY_STATUTORY_PRESETS = {
    "india": {
        "label": "India",
        "pf_applicable": True, "pf_employee_rate": 12.0, "pf_employer_rate": 3.67,
        "pf_max_monthly": 1800.0, "pf_min_basic_for_exclusion": 0,
        # pf_min_basic_for_exclusion=0 means ALL employees are PF members (no exclusion).
        # Per EPF Act, PF is mandatory for employees earning basic <= ₹15,000/month.
        # Setting this to 0 enrolls all employees; set to 15000 to exclude high earners.
        "pf_wage_ceiling": 15000.0,
        "esi_applicable": True, "esi_employee_rate": 0.75, "esi_employer_rate": 3.25,
        "esi_gross_ceiling": 21000.0,
        "pt_applicable": True, "pt_monthly_amount": 200.0, "pt_min_gross": 10000.0,
        "lwf_applicable": False, "lwf_employee_rate": 0.0, "lwf_employer_rate": 0.0,
        "gratuity_applicable": True, "gratuity_rate": 4.81,
    },
    "united_states": {
        "label": "United States",
        "pf_applicable": False, "esi_applicable": False, "pt_applicable": False,
        "lwf_applicable": False, "gratuity_applicable": False,
    },
    "united_kingdom": {
        "label": "United Kingdom",
        "pf_applicable": False, "esi_applicable": False, "pt_applicable": False,
        "lwf_applicable": False, "gratuity_applicable": False,
    },
    "uae": {
        "label": "United Arab Emirates",
        "pf_applicable": False, "esi_applicable": False, "pt_applicable": False,
        "lwf_applicable": False, "gratuity_applicable": False,
    },
    "singapore": {
        "label": "Singapore",
        "pf_applicable": True, "pf_employee_rate": 20.0, "pf_employer_rate": 17.0,
        "pf_max_monthly": 6000.0, "pf_min_basic_for_exclusion": 10000000.0,
        "esi_applicable": False, "pt_applicable": False,
        "lwf_applicable": False, "gratuity_applicable": False,
    },
    "canada": {
        "label": "Canada",
        "pf_applicable": False, "esi_applicable": False, "pt_applicable": False,
        "lwf_applicable": False, "gratuity_applicable": False,
    },
    "australia": {
        "label": "Australia",
        "pf_applicable": True, "pf_employee_rate": 11.5, "pf_employer_rate": 11.5,
        "pf_max_monthly": 1000000.0, "pf_min_basic_for_exclusion": 10000000.0,
        "esi_applicable": False, "pt_applicable": False,
        "lwf_applicable": False, "gratuity_applicable": False,
    },
}


@router.get("/statutory-settings/presets")
def list_statutory_presets(current_user: User = Depends(get_current_user)):
    """List available one-click country statutory presets."""
    return {"presets": [{"code": code, **preset} for code, preset in COUNTRY_STATUTORY_PRESETS.items()]}


@router.post("/statutory-settings/apply-country")
def apply_statutory_preset(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply a country's statutory defaults — optionally scoped to a company."""
    code = (payload.get("country") or "").strip().lower().replace(" ", "_")
    preset = COUNTRY_STATUTORY_PRESETS.get(code)
    if not preset:
        raise HTTPException(status_code=400, detail=f"No preset for country: {code}")
    company_id = payload.get("companyId")

    q = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == current_user.organization_id,
    )
    if company_id is not None:
        q = q.filter(StatutorySetting.company_id == company_id)
    setting = q.first()

    fields = {k: v for k, v in preset.items() if k != "label"}
    if setting:
        for k, v in fields.items():
            setattr(setting, k, v)
    else:
        setting = StatutorySetting(
            organization_id=current_user.organization_id,
            company_id=company_id,
            **fields,
        )
        db.add(setting)
    db.commit()
    return {"message": f"Applied {preset['label']} statutory defaults", "id": setting.id, "company_id": company_id}


# ════════════════════════════════════════════════════════════════
# Tax Regimes
# ════════════════════════════════════════════════════════════════

@router.get("/tax-regimes", response_model=List[dict])
def list_tax_regimes(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(TaxRegime).filter(
        TaxRegime.organization_id == current_user.organization_id,
    )
    if companyId is not None:
        q = q.filter(TaxRegime.company_id == companyId)
    regimes = q.all()
    result = []
    for r in regimes:
        slabs = [
            {"id": s.id, "from_amount": s.from_amount, "to_amount": s.to_amount,
             "rate": s.rate, "sort_order": s.sort_order}
            for s in r.slabs
        ]
        result.append({
            "id": r.id,
            "company_id": r.company_id,
            "name": r.name,
            "regime_type": r.regime_type,
            "is_active": r.is_active,
            "is_default": r.is_default,
            "financial_year": r.financial_year,
            "standard_deduction": r.standard_deduction,
            "rebate_threshold": r.rebate_threshold,
            "rebate_amount": r.rebate_amount,
            "cess_rate": r.cess_rate,
            "surcharge_config": r.surcharge_config,
            "slabs": slabs,
        })
    return result

@router.post("/tax-regimes", status_code=201)
def create_tax_regime(
    data: TaxRegimeCreate,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.is_default:
        fq = db.query(TaxRegime).filter(
            TaxRegime.organization_id == current_user.organization_id,
            TaxRegime.is_default.is_(True),
        )
        if companyId is not None:
            fq = fq.filter(TaxRegime.company_id == companyId)
        fq.update({"is_default": False})
    regime = TaxRegime(
        organization_id=current_user.organization_id,
        company_id=companyId,
        **data.model_dump(exclude={"slabs"})
    )
    db.add(regime)
    db.flush()
    for slab_data in data.slabs:
        slab = TaxSlab(tax_regime_id=regime.id, **slab_data.model_dump())
        db.add(slab)
    db.commit()
    db.refresh(regime)
    return {"message": "Tax regime created", "id": regime.id}

@router.put("/tax-regimes/{regime_id}")
def update_tax_regime(
    regime_id: int,
    data: TaxRegimeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    regime = db.query(TaxRegime).filter(
        TaxRegime.id == regime_id,
        TaxRegime.organization_id == current_user.organization_id,
    ).first()
    if not regime:
        raise HTTPException(status_code=404, detail="Tax regime not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if updates.get("is_default"):
        db.query(TaxRegime).filter(
            TaxRegime.organization_id == current_user.organization_id,
            TaxRegime.is_default.is_(True),
            TaxRegime.id != regime_id,
        ).update({"is_default": False})
    for k, v in updates.items():
        setattr(regime, k, v)
    db.commit()
    return {"message": "Tax regime updated"}

@router.delete("/tax-regimes/{regime_id}")
def delete_tax_regime(
    regime_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    regime = db.query(TaxRegime).filter(
        TaxRegime.id == regime_id,
        TaxRegime.organization_id == current_user.organization_id,
    ).first()
    if not regime:
        raise HTTPException(status_code=404, detail="Tax regime not found")
    db.delete(regime)
    db.commit()
    return {"message": "Tax regime deleted"}


# ════════════════════════════════════════════════════════════════
# Tax Slabs (manage within a regime)
# ════════════════════════════════════════════════════════════════

@router.get("/tax-regimes/{regime_id}/slabs", response_model=List[dict])
def list_tax_slabs(
    regime_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    regime = db.query(TaxRegime).filter(
        TaxRegime.id == regime_id,
        TaxRegime.organization_id == current_user.organization_id,
    ).first()
    if not regime:
        raise HTTPException(status_code=404, detail="Tax regime not found")
    return [
        {"id": s.id, "from_amount": s.from_amount, "to_amount": s.to_amount,
         "rate": s.rate, "sort_order": s.sort_order}
        for s in sorted(regime.slabs, key=lambda s: s.from_amount)
    ]

@router.post("/tax-regimes/{regime_id}/slabs", status_code=201)
def add_tax_slab(
    regime_id: int,
    data: TaxSlabSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    regime = db.query(TaxRegime).filter(
        TaxRegime.id == regime_id,
        TaxRegime.organization_id == current_user.organization_id,
    ).first()
    if not regime:
        raise HTTPException(status_code=404, detail="Tax regime not found")
    slab = TaxSlab(tax_regime_id=regime.id, **data.model_dump())
    db.add(slab)
    db.commit()
    return {"message": "Tax slab added", "id": slab.id}

@router.delete("/tax-slabs/{slab_id}")
def delete_tax_slab(
    slab_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    slab = db.query(TaxSlab).join(TaxRegime).filter(
        TaxSlab.id == slab_id,
        TaxRegime.organization_id == current_user.organization_id,
    ).first()
    if not slab:
        raise HTTPException(status_code=404, detail="Tax slab not found")
    db.delete(slab)
    db.commit()
    return {"message": "Tax slab deleted"}


# ════════════════════════════════════════════════════════════════
# Attendance Policy
# ════════════════════════════════════════════════════════════════

@router.get("/attendance-policies", response_model=List[dict])
def list_attendance_policies(
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(AttendancePolicy).filter(
        AttendancePolicy.organization_id == current_user.organization_id,
        AttendancePolicy.status != "inactive",
    )
    companyId = resolve_company_scope(db, current_user, companyId)
    if companyId is not None:
        from sqlalchemy import or_
        q = q.filter(AttendancePolicy.company_id == companyId)
    policies = q.all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": getattr(p, "description", None),
            "working_days_per_week": p.working_days_per_week,
            "working_days": p.working_days,
            "half_day_as_full_paid": p.half_day_as_full_paid,
            "paid_leave_as_present": p.paid_leave_as_present,
            "holiday_as_present": p.holiday_as_present,
            "overtime_threshold_hours": p.overtime_threshold_hours,
            "overtime_rate": p.overtime_rate,
            "overtime_tiers": getattr(p, "overtime_tiers", None),
            "shift_differential_rates": getattr(p, "shift_differential_rates", None),
            "late_mark_threshold_minutes": p.late_mark_threshold_minutes,
            "half_day_threshold_hours": p.half_day_threshold_hours,
            "wfh_allowed": getattr(p, "wfh_allowed", False),
            "geofence_enabled": getattr(p, "geofence_enabled", False),
            "geofence_radius": getattr(p, "geofence_radius", 100.0),
            "shift_id": getattr(p, "shift_id", None),
            "is_shared_template": bool(getattr(p, "is_shared_template", False)),
            "late_to_absent_count": getattr(p, "late_to_absent_count", None),
            "early_to_absent_count": getattr(p, "early_to_absent_count", None),
            "missing_checkout_rule": getattr(p, "missing_checkout_rule", None) or "half_day",
            "check_in_time": getattr(p, "check_in_time", "09:00"),
            "check_out_time": getattr(p, "check_out_time", "18:00"),
            "break_hours": getattr(p, "break_hours", 1.0),
            "comp_off_enabled": getattr(p, "comp_off_enabled", False),
            "max_comp_off_balance": getattr(p, "max_comp_off_balance", 5),
            "max_overtime_hours_per_month": getattr(p, "max_overtime_hours_per_month", None),
            "selfie_checkin_enabled": getattr(p, "selfie_checkin_enabled", False),
            "ip_restriction_enabled": getattr(p, "ip_restriction_enabled", False),
            "allowed_ip_ranges": getattr(p, "allowed_ip_ranges", None),
            "wifi_checkin_enabled": getattr(p, "wifi_checkin_enabled", False),
            "allowed_ssids": getattr(p, "allowed_ssids", None),
            "auto_approve_if_no_mark": getattr(p, "auto_approve_if_no_mark", False),
            "min_hours_for_full_day": getattr(p, "min_hours_for_full_day", 8.0),
            "shift_based_payroll": getattr(p, "shift_based_payroll", False),
            "version": getattr(p, "version", 1),
            "effective_from": p.effective_from.isoformat() if getattr(p, "effective_from", None) else None,
            "company_id": p.company_id,
            "status": p.status,
        }
        for p in policies
    ]

@router.post("/attendance-policies", status_code=201)
def create_attendance_policy(
    data: AttendancePolicyCreate,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Wizard sends null for untouched fields — drop them so column defaults apply
    payload = data.model_dump(exclude_none=True)
    payload["working_days"] = _derive_working_days(
        payload.get("working_days_per_week", 6), payload.get("working_days")
    )
    payload["company_id"] = companyId or payload.get("company_id")
    policy = AttendancePolicy(organization_id=current_user.organization_id, **payload)
    policy.is_shared_template = True
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return {"message": "Attendance policy created", "id": policy.id}

@router.put("/attendance-policies/{policy_id}")
def update_attendance_policy(
    policy_id: int,
    data: AttendancePolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    policy = db.query(AttendancePolicy).filter(
        AttendancePolicy.id == policy_id,
        AttendancePolicy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Attendance policy not found")
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    # If only the per-week count changed, re-derive the workweek day-set
    if "working_days_per_week" in updates and "working_days" not in updates:
        updates["working_days"] = _derive_working_days(updates["working_days_per_week"])
    for k, v in updates.items():
        setattr(policy, k, v)
    db.commit()
    return {"message": "Attendance policy updated"}

@router.delete("/attendance-policies/{policy_id}")
def delete_attendance_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    policy = db.query(AttendancePolicy).filter(
        AttendancePolicy.id == policy_id,
        AttendancePolicy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Attendance policy not found")
    policy.status = "inactive"
    db.commit()
    return {"message": "Attendance policy deactivated"}



@router.get("/compliance/states")
def list_compliance_states():
    """List all states with compliance data."""
    states = []
    for code in get_all_state_codes():
        pt = get_pt_for_state(code)
        lwf_data = get_lwf_for_state(code)
        states.append({
            "code": code,
            "state_name": pt["state_name"] if pt else code,
            "has_pt": pt is not None,
            "has_lwf": lwf_data is not None and lwf_data["applicable"],
        })
    return sorted(states, key=lambda s: s["state_name"])


def _ser_pt_row(r) -> dict:
    return {
        "id": r.id,
        "from_gross": r.from_gross,
        "to_gross": r.to_gross,
        "amount": r.amount,
        "description": r.description or "",
        "annual_max": r.annual_max,
        "effective_from": r.effective_from.isoformat() if r.effective_from else None,
        "effective_to": r.effective_to.isoformat() if r.effective_to else None,
        "source": r.source or "custom",
        "organization_id": r.organization_id,
        "company_id": r.company_id,
    }


def _ser_lwf_row(r) -> dict:
    return {
        "id": r.id,
        "applicable": bool(r.applicable),
        "employee_contribution": float(r.employee_contribution or 0),
        "employer_contribution": float(r.employer_contribution or 0),
        "frequency": r.frequency or "monthly",
        "max_wage_for_applicability": r.max_wage_for_applicability,
        "effective_from": r.effective_from.isoformat() if r.effective_from else None,
        "effective_to": r.effective_to.isoformat() if r.effective_to else None,
        "source": r.source or "custom",
        "organization_id": r.organization_id,
        "company_id": r.company_id,
    }


def _assert_company_in_org(db: Session, org_id: int, company_id: Optional[int]) -> None:
    if company_id is None:
        return
    from models import Company
    if not db.query(Company).filter(
        Company.id == company_id, Company.organization_id == org_id
    ).first():
        raise HTTPException(status_code=404, detail=f"Company {company_id} not found in your organization")


def _parse_iso_date(value: str, field: str):
    from datetime import date as _date
    try:
        return _date.fromisoformat(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {field}: expected YYYY-MM-DD")


@router.get("/compliance/{state_code}/pt")
def get_state_pt(
    state_code: str,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Professional Tax slabs for a state, scope-resolved:
    your company override -> your org override -> platform default -> static."""
    from datetime import date as _date
    from models import StatePTSlab
    from services.compliance_engine import _active_rows_for_scope

    key = resolve_state_key(state_code)
    static = get_pt_for_state(state_code)
    if not key or not static:
        raise HTTPException(status_code=404, detail=f"State '{state_code}' not found in PT database")
    org_id = current_user.organization_id
    _assert_company_in_org(db, org_id, companyId)
    today = _date.today()
    rows, scope = _active_rows_for_scope(db, StatePTSlab, key, today, org_id, companyId)
    if rows:
        rows = sorted(rows, key=lambda r: (r.from_gross or 0.0))

    if rows:
        slabs = [_ser_pt_row(r) for r in rows]
        annual_max = max((float(r.annual_max or 0) for r in rows), default=0) or max(
            (float(r.amount or 0) for r in rows), default=0
        ) * 12
        out = {
            "state_code": key,
            "state_name": rows[0].state_name or static.get("state_name", state_code),
            "slabs": slabs,
            "annual_max": annual_max,
            "notes": static.get("notes", ""),
            "source": "db",
            "scope": scope,
        }
    else:
        slabs = [
            {**s, "id": None, "source": "static", "effective_from": None,
             "effective_to": None, "organization_id": None, "company_id": None}
            for s in static.get("slabs", [])
        ]
        out = {
            **static,
            "state_code": key,
            "slabs": slabs,
            "source": "static",
            "scope": "static",
        }

    active_ids = {s.get("id") for s in out["slabs"] if s.get("id")}
    history_rows = (
        db.query(StatePTSlab)
        .filter(StatePTSlab.state_code == key)
        .filter(StatePTSlab.organization_id == org_id)
        .order_by(StatePTSlab.effective_from.desc(), StatePTSlab.from_gross.asc())
        .all()
    )
    out["history"] = [_ser_pt_row(r) for r in history_rows if r.id not in active_ids]
    return out


@router.get("/compliance/{state_code}/lwf")
def get_state_lwf(
    state_code: str,
    companyId: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Labour Welfare Fund rates for a state, scope-resolved like PT."""
    from datetime import date as _date
    from models import StateLWFConfig
    from services.compliance_engine import _active_rows_for_scope

    key = resolve_state_key(state_code)
    static = get_lwf_for_state(state_code)
    if not key or not static:
        raise HTTPException(status_code=404, detail=f"State '{state_code}' not found in LWF database")
    org_id = current_user.organization_id
    _assert_company_in_org(db, org_id, companyId)
    today = _date.today()
    rows, scope = _active_rows_for_scope(db, StateLWFConfig, key, today, org_id, companyId)

    if rows:
        rows.sort(key=lambda r: (r.effective_from or _date.min), reverse=True)
        out = {
            **_ser_lwf_row(rows[0]),
            "state_code": key,
            "state_name": rows[0].state_name or static.get("state_name", state_code),
            "notes": static.get("notes", ""),
            "source": "db",
            "scope": scope,
        }
    else:
        out = {
            **static,
            "state_code": key,
            "id": None,
            "effective_from": None,
            "effective_to": None,
            "organization_id": None,
            "company_id": None,
            "source": "static",
            "scope": "static",
        }

    active_id = out.get("id")
    history_rows = (
        db.query(StateLWFConfig)
        .filter(StateLWFConfig.state_code == key)
        .filter(StateLWFConfig.organization_id == org_id)
        .order_by(StateLWFConfig.effective_from.desc())
        .all()
    )
    out["history"] = [_ser_lwf_row(r) for r in history_rows if r.id != active_id]
    return out


class PTSlabInput(BaseModel):
    from_gross: float
    to_gross: Optional[float] = None
    amount: float
    description: str = ""


class PTReplaceRequest(BaseModel):
    effective_from: str  # YYYY-MM-DD
    slabs: List[PTSlabInput]
    companyId: Optional[int] = None


@router.put("/compliance/{state_code}/pt")
def replace_state_pt(
    state_code: str,
    req: PTReplaceRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Version-on-change replace of the PT slab set for your company/org scope.

    In-force rows are closed the day before `effective_from`; rows starting on
    or after it are purged (never used); all earlier history is preserved so
    past payroll runs stay reproducible.
    """
    from datetime import date as _date, timedelta
    from models import StatePTSlab

    key = resolve_state_key(state_code)
    if not key:
        raise HTTPException(status_code=404, detail=f"State '{state_code}' not found")
    if not req.slabs:
        raise HTTPException(status_code=400, detail="At least one slab is required")
    org_id = current_user.organization_id
    _assert_company_in_org(db, org_id, req.companyId)
    new_from = _parse_iso_date(req.effective_from, "effective_from")

    ordered = sorted(req.slabs, key=lambda s: s.from_gross)
    for i, s in enumerate(ordered):
        if s.amount < 0:
            raise HTTPException(status_code=400, detail="Slab amounts cannot be negative")
        if s.from_gross < 0:
            raise HTTPException(status_code=400, detail="Slab ranges cannot be negative")
        if s.to_gross is not None and s.to_gross < s.from_gross:
            raise HTTPException(status_code=400, detail=f"Slab '{s.from_gross}' has to_gross below from_gross")
        if i > 0:
            prev = ordered[i - 1]
            if prev.to_gross is None:
                raise HTTPException(status_code=400, detail="Only the last slab may have an open-ended upper range")
            if s.from_gross < prev.to_gross:
                raise HTTPException(status_code=400, detail=f"Slab {s.from_gross} overlaps the previous slab (up to {prev.to_gross})")

    q = db.query(StatePTSlab).filter(
        StatePTSlab.state_code == key,
        StatePTSlab.organization_id == org_id,
    )
    q = q.filter(StatePTSlab.company_id == req.companyId) if req.companyId is not None else q.filter(StatePTSlab.company_id.is_(None))
    for r in q.all():
        if r.effective_from >= new_from:
            db.delete(r)
        elif r.effective_to is None or r.effective_to >= new_from:
            r.effective_to = new_from - timedelta(days=1)

    state_name = (get_pt_for_state(state_code) or {}).get("state_name", state_code)
    for s in ordered:
        db.add(StatePTSlab(
            state_code=key,
            state_name=state_name,
            organization_id=org_id,
            company_id=req.companyId,
            from_gross=float(s.from_gross),
            to_gross=float(s.to_gross) if s.to_gross is not None else None,
            amount=float(s.amount),
            description=s.description or "",
            effective_from=new_from,
            effective_to=None,
            source="custom",
        ))
    db.commit()
    scope = "company" if req.companyId is not None else "organization"
    return {
        "message": f"PT slabs for {state_name} updated ({scope} scope, effective {new_from.isoformat()})",
        "effective_from": new_from.isoformat(),
        "scope": scope,
        "count": len(ordered),
    }


class LWFReplaceRequest(BaseModel):
    effective_from: str  # YYYY-MM-DD
    companyId: Optional[int] = None
    applicable: bool = True
    employee_contribution: float = 0.0
    employer_contribution: float = 0.0
    frequency: str = "monthly"
    max_wage_for_applicability: Optional[float] = None


@router.put("/compliance/{state_code}/lwf")
def replace_state_lwf(
    state_code: str,
    req: LWFReplaceRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Version-on-change replace of the LWF config for your company/org scope."""
    from datetime import date as _date, timedelta
    from models import StateLWFConfig

    key = resolve_state_key(state_code)
    if not key:
        raise HTTPException(status_code=404, detail=f"State '{state_code}' not found")
    if req.frequency not in ("monthly", "half_yearly", "yearly"):
        raise HTTPException(status_code=400, detail="frequency must be 'monthly', 'half_yearly' or 'yearly'")
    if req.employee_contribution < 0 or req.employer_contribution < 0:
        raise HTTPException(status_code=400, detail="Contributions cannot be negative")
    org_id = current_user.organization_id
    _assert_company_in_org(db, org_id, req.companyId)
    new_from = _parse_iso_date(req.effective_from, "effective_from")

    q = db.query(StateLWFConfig).filter(
        StateLWFConfig.state_code == key,
        StateLWFConfig.organization_id == org_id,
    )
    q = q.filter(StateLWFConfig.company_id == req.companyId) if req.companyId is not None else q.filter(StateLWFConfig.company_id.is_(None))
    for r in q.all():
        if r.effective_from >= new_from:
            db.delete(r)
        elif r.effective_to is None or r.effective_to >= new_from:
            r.effective_to = new_from - timedelta(days=1)

    state_name = (get_lwf_for_state(state_code) or {}).get("state_name", state_code)
    db.add(StateLWFConfig(
        state_code=key,
        state_name=state_name,
        organization_id=org_id,
        company_id=req.companyId,
        applicable=req.applicable,
        employee_contribution=float(req.employee_contribution),
        employer_contribution=float(req.employer_contribution),
        frequency=req.frequency,
        max_wage_for_applicability=req.max_wage_for_applicability,
        effective_from=new_from,
        effective_to=None,
        source="custom",
    ))
    db.commit()
    scope = "company" if req.companyId is not None else "organization"
    return {
        "message": f"LWF config for {state_name} updated ({scope} scope, effective {new_from.isoformat()})",
        "effective_from": new_from.isoformat(),
        "scope": scope,
    }


def _delete_dated_row(db: Session, model, row_id: int, org_id: int, label: str) -> dict:
    from datetime import date as _date
    r = db.query(model).filter(model.id == row_id).first()
    if not r or r.organization_id != org_id:
        raise HTTPException(status_code=404, detail=f"{label} row {row_id} not found")
    today = _date.today()
    is_active = r.effective_from <= today and (r.effective_to is None or r.effective_to >= today)
    if is_active:
        raise HTTPException(
            status_code=400,
            detail="This row is currently in force — replace the whole set (PUT) instead of deleting it",
        )
    db.delete(r)
    db.commit()
    return {"message": f"{label} row {row_id} deleted", "id": row_id}


@router.delete("/compliance/pt/{row_id}")
def delete_pt_row(row_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from models import StatePTSlab
    return _delete_dated_row(db, StatePTSlab, row_id, current_user.organization_id, "PT slab")


@router.delete("/compliance/lwf/{row_id}")
def delete_lwf_row(row_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from models import StateLWFConfig
    return _delete_dated_row(db, StateLWFConfig, row_id, current_user.organization_id, "LWF config")


class PTRequest(BaseModel):
    gross_salary: float
    state_code: str = "other"
    companyId: Optional[int] = None


class LWFRequest(BaseModel):
    gross_salary: float
    state_code: str
    companyId: Optional[int] = None


@router.post("/compliance/calculate-pt")
def calculate_professional_tax(
    req: PTRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Calculate monthly Professional Tax for a given salary and state.

    This is what competitors charge extra for — we give it free and automatic.
    Keka requires manual PT slab updates when states revise rates.
    Uses your org/company slabs when set, else platform defaults, else static.
    """
    try:
        from services.compliance_engine import calculate_professional_tax as engine_pt
        from datetime import date as _date
        org_id = current_user.organization_id
        _assert_company_in_org(db, org_id, req.companyId)
        result = engine_pt(
            req.gross_salary, req.state_code, db=db, as_of=_date.today(),
            organization_id=org_id, company_id=req.companyId,
        )
        amount = result.get("amount", 0.0)
        state_name = result.get("state", "Unknown")
        slabs: list = []
        if result.get("source") == "db":
            from models import StatePTSlab
            from services.compliance_engine import _active_rows_for_scope
            key = resolve_state_key(req.state_code)
            rows, _scope = _active_rows_for_scope(
                db, StatePTSlab, key, _date.today(), org_id, req.companyId
            ) if key else ([], None)
            slabs = [
                {"from_gross": r.from_gross, "to_gross": r.to_gross,
                 "amount": r.amount, "description": r.description or ""}
                for r in rows
            ]
        else:
            pt_config = get_pt_for_state(req.state_code) or get_pt_for_state("other")
            slabs = pt_config["slabs"] if pt_config else []
        return {
            "gross_salary": req.gross_salary,
            "state_code": req.state_code,
            "state_name": state_name,
            "monthly_pt": amount,
            "annual_pt": amount * 12,
            "source": result.get("source", "static"),
            "slabs_applied": slabs,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compliance/calculate-lwf")
def calculate_lwf_endpoint(
    req: LWFRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Calculate monthly LWF contributions for a given salary and state."""
    try:
        from services.compliance_engine import calculate_lwf as engine_lwf
        from datetime import date as _date
        org_id = current_user.organization_id
        _assert_company_in_org(db, org_id, req.companyId)
        result = engine_lwf(
            req.gross_salary, req.state_code, db=db, as_of=_date.today(),
            organization_id=org_id, company_id=req.companyId,
        )
        return {
            "gross_salary": req.gross_salary,
            "state_code": req.state_code,
            "state_name": result.get("state", "Unknown"),
            "employee_contribution": result.get("employee", 0.0),
            "employer_contribution": result.get("employer", 0.0),
            "applicable": result.get("applicable", False),
            "frequency": result.get("frequency", "monthly"),
            "source": result.get("source", "static"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class OrgStateRequest(BaseModel):
    state: str


@router.put("/compliance/org-state")
def update_organization_state(req: OrgStateRequest, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Set the organization's registered state for auto PT/LWF compliance.

    Once set, all payroll runs will auto-calculate PT and LWF based on
    this state's rules — no manual slab updates needed.
    """
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Validate the state exists in our compliance database
    resolved = resolve_state_key(req.state)
    if not resolved:
        raise HTTPException(
            status_code=400,
            detail=f"State '{req.state}' not found in compliance database. "
                   f"Call GET /api/payroll-config/compliance/states to see available states.",
        )

    org.registered_state = req.state
    db.commit()
    db.refresh(org)
    return {
        "message": f"Organization registered state set to '{req.state}'",
        "resolved_key": resolved,
        "note": "All future payroll runs will auto-calculate PT and LWF for this state.",
    }


# ── Per-Company Setup Wizard ────────────────────────────────────────────────

@router.get("/api/payroll-config/company-setup-status/{company_id}", tags=["Payroll Configuration"])
def get_company_setup_status(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Check payroll setup completeness for a specific company.

    Returns a checklist showing what's configured and what's missing.
    This is the "am I ready to run payroll?" check for each company.
    """
    from services.payroll_preflight import PayrollPreFlight
    from datetime import date as _date

    # Use current month for validation
    today = _date.today()
    validator = PayrollPreFlight(db)
    result = validator.validate_company(
        current_user.organization_id, company_id, today.month, today.year
    )

    # Build setup checklist
    checklist = [
        {
            "step": 1,
            "name": "Company Profile",
            "description": "Company details (country, state, registration)",
            "status": "pass" if True else "fail",
            "required": True,
        },
        {
            "step": 2,
            "name": "Payroll Policy",
            "description": "Pro-ration method, rounding, currency",
            "status": "pass" if not any(e["type"] == "payroll_policy" and e["severity"] == "critical" for e in result["errors"]) else "fail",
            "required": True,
        },
        {
            "step": 3,
            "name": "Attendance Policy",
            "description": "Working days, overtime, late rules",
            "status": "pass" if not any(e["type"] == "attendance_policy" and e["severity"] == "critical" for e in result["errors"]) else "fail",
            "required": True,
        },
        {
            "step": 4,
            "name": "Payroll Components",
            "description": "Earnings (Basic, HRA, etc.) and Deductions (PF, ESI, etc.)",
            "status": "pass" if not any(e["type"] == "payroll_components" and e["severity"] == "critical" for e in result["errors"]) else "fail",
            "required": True,
        },
        {
            "step": 5,
            "name": "Statutory Settings",
            "description": "PF/ESI/PT rates and ceilings",
            "status": "pass" if not any(e["type"] == "statutory_setting" and e["severity"] == "critical" for e in result["errors"]) else "fail",
            "required": True,
        },
        {
            "step": 6,
            "name": "Tax Configuration",
            "description": "Tax regime, slabs, deduction caps",
            "status": "pass" if not any(e["type"] == "tax_regime" and e["severity"] == "critical" for e in result["errors"]) else "fail",
            "required": True,
        },
        {
            "step": 7,
            "name": "Employee Salaries",
            "description": "All employees have base_salary configured",
            "status": "pass" if not any(e["type"] == "employee_salary" and e["severity"] == "warning" for e in result["errors"] + result.get("warnings", [])) else "warn",
            "required": True,
        },
        {
            "step": 8,
            "name": "Attendance Data",
            "description": "Employees have attendance records for the payroll period",
            "status": "pass" if not any(e["type"] == "attendance_data" for e in result["errors"]) else "fail",
            "required": True,
        },
        {
            "step": 9,
            "name": "Holiday Calendar",
            "description": "Holidays configured for the payroll period",
            "status": "pass" if not any(e["type"] == "holidays" for e in result["errors"]) else "info",
            "required": False,
        },
        {
            "step": 10,
            "name": "Payroll Template",
            "description": "Company-specific payroll template created",
            "status": "pass" if not any(e["type"] == "payroll_template" for e in result["errors"]) else "fail",
            "required": True,
        },
    ]

    passed = sum(1 for s in checklist if s["status"] == "pass")
    total = len(checklist)

    return {
        "company_id": company_id,
        "ready_to_run_payroll": result["valid"],
        "checklist": checklist,
        "progress": f"{passed}/{total}",
        "progress_pct": round(passed / total * 100),
        "errors": result["errors"],
        "warnings": result["warnings"],
    }
