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
from data.industry_templates import INDUSTRY_TEMPLATES, get_industry_codes, get_template_summary
from data.state_compliance import (
    PROFESSIONAL_TAX, LWF, get_all_state_codes, get_lwf_state_codes,
    get_pt_for_state, get_lwf_for_state,
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
    pro_ration_method: str = "paid_days"
    rounding_method: str = "nearest"
    decimal_places: int = 2
    round_net_salary: bool = True
    include_gratuity: bool = False
    gratuity_rate: float = 4.81
    default_currency: str = "INR"
    allow_negative_net: bool = False

class PayrollPolicyUpdate(BaseModel):
    name: Optional[str] = None
    pro_ration_method: Optional[str] = None
    rounding_method: Optional[str] = None
    decimal_places: Optional[int] = None
    round_net_salary: Optional[bool] = None
    include_gratuity: Optional[bool] = None
    gratuity_rate: Optional[float] = None
    default_currency: Optional[str] = None
    allow_negative_net: Optional[bool] = None

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
    pf_employer_rate: float = 12.0
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
    working_days_per_week: int = 6
    working_days: str = "0,1,2,3,4,5,6"  # Comma-separated: 0=Sun, 1=Mon, etc.
    half_day_as_full_paid: bool = True
    paid_leave_as_present: bool = True
    holiday_as_present: bool = True
    overtime_threshold_hours: float = 8.0
    overtime_rate: float = 1.5
    late_mark_threshold_minutes: int = 15
    half_day_threshold_hours: float = 4.0
    company_id: Optional[int] = None  # None = org-wide default

class AttendancePolicyUpdate(BaseModel):
    name: Optional[str] = None
    working_days_per_week: Optional[int] = None
    working_days: Optional[str] = None  # Comma-separated: 0=Sun, 1=Mon, etc.
    half_day_as_full_paid: Optional[bool] = None
    paid_leave_as_present: Optional[bool] = None
    holiday_as_present: Optional[bool] = None
    overtime_threshold_hours: Optional[float] = None
    overtime_rate: Optional[float] = None
    late_mark_threshold_minutes: Optional[int] = None
    half_day_threshold_hours: Optional[float] = None
    company_id: Optional[int] = None


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
def list_policies(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    policies = db.query(PayrollPolicy).filter(
        PayrollPolicy.organization_id == current_user.organization_id,
        PayrollPolicy.status != "inactive",
    ).order_by(PayrollPolicy.id).all()
    return [
        {
            "id": p.id,
            "name": p.name,
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
    policy = PayrollPolicy(organization_id=org.id, **data.model_dump())
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(PayrollComponent).filter(
        PayrollComponent.organization_id == current_user.organization_id,
        PayrollComponent.status != "inactive",
    )
    if policy_id:
        query = query.filter(PayrollComponent.payroll_policy_id == policy_id)
    components = query.order_by(PayrollComponent.priority).all()
    return [
        {
            "id": c.id,
            "payroll_policy_id": c.payroll_policy_id,
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    policy_id = data.payroll_policy_id
    if policy_id is None:
        # Fall back to the org's default (or first active) payroll policy
        default_policy = db.query(PayrollPolicy).filter(
            PayrollPolicy.organization_id == current_user.organization_id,
            PayrollPolicy.status == "active",
        ).order_by(PayrollPolicy.id).first()
        if default_policy:
            policy_id = default_policy.id
        else:
            # Create a default policy if none exists
            default_policy = PayrollPolicy(
                organization_id=current_user.organization_id,
                name="Default Payroll Policy",
                pro_ration_method="paid_days",
                rounding_method="nearest",
                decimal_places=2,
                round_net_salary=True,
                include_gratuity=False,
                gratuity_rate=4.81,
                default_currency="INR",
                allow_negative_net=False,
                status="active",
            )
            db.add(default_policy)
            db.flush()
            policy_id = default_policy.id

    # Verify policy belongs to user's org
    policy = db.query(PayrollPolicy).filter(
        PayrollPolicy.id == policy_id,
        PayrollPolicy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Payroll policy not found")
    payload = data.model_dump()
    payload["payroll_policy_id"] = policy_id
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    setting = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == current_user.organization_id,
    ).first()
    if not setting:
        return {
            "id": None,
            "organization_id": current_user.organization_id,
            "message": "No custom settings configured. Using system defaults.",
        }
    return {
        "id": setting.id,
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
        "bonus_wage_ceiling": setting.bonus_wage_ceiling,
    }

@router.put("/statutory-settings")
def upsert_statutory_settings(
    data: StatutorySettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    setting = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == current_user.organization_id,
    ).first()
    if setting:
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        for k, v in updates.items():
            setattr(setting, k, v)
    else:
        setting = StatutorySetting(
            organization_id=current_user.organization_id,
            **{k: v for k, v in data.model_dump().items() if v is not None},
        )
        db.add(setting)
    db.commit()
    db.refresh(setting)
    return {"message": "Statutory settings updated", "id": setting.id}


# Country-specific statutory presets. The engine is country-agnostic; these are
# sensible one-click starting points (always fine-tunable via the PUT endpoint).
COUNTRY_STATUTORY_PRESETS = {
    "india": {
        "label": "India",
        "pf_applicable": True, "pf_employee_rate": 12.0, "pf_employer_rate": 12.0,
        "pf_max_monthly": 1800.0, "pf_min_basic_for_exclusion": 15000.0,
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
    """Apply a country's statutory defaults to the organization's settings.

    When companyId/branchId is provided, the preset is stored as a scoped
    payroll config entry so that company/branch can run its own jurisdiction
    (e.g. a UAE office under an Indian org).
    """
    code = (payload.get("country") or "").strip().lower().replace(" ", "_")
    preset = COUNTRY_STATUTORY_PRESETS.get(code)
    if not preset:
        raise HTTPException(status_code=400, detail=f"No preset for country: {code}")
    company_id = payload.get("companyId")
    branch_id = payload.get("branchId")

    if company_id or branch_id:
        org = db.query(Organization).filter(
            Organization.deleted_at.is_(None),
            Organization.id == current_user.organization_id,
        ).first()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        data = json.loads(json.dumps(org.settings or {}))
        configs = data.get("payroll_configs") or []
        entry = {
            "country": preset["label"],
            "companyId": company_id,
            "branchId": branch_id,
            "pfApplicable": bool(preset.get("pf_applicable", False)),
            "esiApplicable": bool(preset.get("esi_applicable", False)),
            "ptApplicable": bool(preset.get("pt_applicable", False)),
            "lwfApplicable": bool(preset.get("lwf_applicable", False)),
            "gratuityApplicable": bool(preset.get("gratuity_applicable", False)),
            "pfPercent": preset.get("pf_employee_rate"),
            "esiPercent": preset.get("esi_employee_rate"),
            "gratuityRate": preset.get("gratuity_rate"),
        }
        configs = [c for c in configs if (c.get("companyId") != company_id or c.get("branchId") != branch_id)]
        configs.append(entry)
        data["payroll_configs"] = configs
        org.settings = data
        db.commit()
        return {"message": f"Applied {preset['label']} defaults to company/branch", "scoped": True}

    setting = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == current_user.organization_id,
    ).first()
    fields = {k: v for k, v in preset.items() if k != "label"}
    if setting:
        for k, v in fields.items():
            setattr(setting, k, v)
    else:
        setting = StatutorySetting(organization_id=current_user.organization_id, **fields)
        db.add(setting)
    db.commit()
    return {"message": f"Applied {preset['label']} statutory defaults", "id": setting.id}


# ════════════════════════════════════════════════════════════════
# Tax Regimes
# ════════════════════════════════════════════════════════════════

@router.get("/tax-regimes", response_model=List[dict])
def list_tax_regimes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    regimes = db.query(TaxRegime).filter(
        TaxRegime.organization_id == current_user.organization_id,
    ).all()
    result = []
    for r in regimes:
        slabs = [
            {"id": s.id, "from_amount": s.from_amount, "to_amount": s.to_amount,
             "rate": s.rate, "sort_order": s.sort_order}
            for s in r.slabs
        ]
        result.append({
            "id": r.id,
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.is_default:
        db.query(TaxRegime).filter(
            TaxRegime.organization_id == current_user.organization_id,
            TaxRegime.is_default.is_(True),
        ).update({"is_default": False})
    regime = TaxRegime(organization_id=current_user.organization_id, **data.model_dump(exclude={"slabs"}))
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
    if companyId is not None:
        from sqlalchemy import or_
        q = q.filter(or_(AttendancePolicy.company_id == companyId, AttendancePolicy.company_id.is_(None)))
    policies = q.all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "working_days_per_week": p.working_days_per_week,
            "working_days": p.working_days,
            "half_day_as_full_paid": p.half_day_as_full_paid,
            "paid_leave_as_present": p.paid_leave_as_present,
            "holiday_as_present": p.holiday_as_present,
            "overtime_threshold_hours": p.overtime_threshold_hours,
            "overtime_rate": p.overtime_rate,
            "late_mark_threshold_minutes": p.late_mark_threshold_minutes,
            "half_day_threshold_hours": p.half_day_threshold_hours,
            "company_id": p.company_id,
            "status": p.status,
        }
        for p in policies
    ]

@router.post("/attendance-policies", status_code=201)
def create_attendance_policy(
    data: AttendancePolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payload = data.model_dump()
    # Derive the workweek day-set from working_days_per_week when not explicit
    payload["working_days"] = _derive_working_days(
        payload.get("working_days_per_week", 6), payload.get("working_days")
    )
    policy = AttendancePolicy(organization_id=current_user.organization_id, **payload)
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


# ════════════════════════════════════════════════════════════════
# Industry Templates — One-click setup (our competitive moat)
# ════════════════════════════════════════════════════════════════

@router.get("/industries", response_model=List[dict])
def list_industry_templates():
    """List all available industry templates with metadata.

    This is our competitive differentiator — pre-configured payroll,
    attendance, and compliance settings for each industry.
    Competitors take 4-12 weeks to configure this manually.
    """
    summaries = []
    for code in get_industry_codes():
        s = get_template_summary(code)
        if s:
            summaries.append(s)
    return summaries


def _apply_industry_to_org(db: Session, org_id: int, template_code: str) -> Dict[str, Any]:
    """Apply an industry template to an organization.

    Creates:
      1. PayrollPolicy with industry defaults
      2. AttendancePolicy with industry work rules
      3. StatutorySetting with industry compliance config
      4. PayrollComponents (earnings + deductions) for the industry
      5. TaxRegime + TaxSlabs for the industry
      6. Updates Organization with default policy IDs
    """
    tpl = INDUSTRY_TEMPLATES.get(template_code)
    if not tpl:
        raise ValueError(f"Industry template '{template_code}' not found")

    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise ValueError("Organization not found")

    created = {"payroll_policy": None, "attendance_policy": None,
               "statutory_settings": None, "tax_regime": None,
               "components": []}

    # 1. Payroll Policy
    policy = PayrollPolicy(organization_id=org_id, **tpl["payroll_policy"])
    db.add(policy)
    db.flush()
    created["payroll_policy"] = policy.id

    # 2. Attendance Policy
    att = AttendancePolicy(organization_id=org_id, **tpl["attendance_policy"])
    db.add(att)
    db.flush()
    created["attendance_policy"] = att.id

    # 3. Statutory Settings (upsert)
    existing_stat = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == org_id
    ).first()
    if existing_stat:
        for k, v in tpl["statutory_settings"].items():
            setattr(existing_stat, k, v)
        db.flush()
        created["statutory_settings"] = existing_stat.id
    else:
        stat = StatutorySetting(organization_id=org_id, **tpl["statutory_settings"])
        db.add(stat)
        db.flush()
        created["statutory_settings"] = stat.id

    # 4. Payroll Components
    for comp_data in tpl.get("components", []):
        comp = PayrollComponent(
            organization_id=org_id,
            payroll_policy_id=policy.id,
            **comp_data,
        )
        db.add(comp)
        db.flush()
        created["components"].append(comp.id)

    # 5. Tax Regime + Slabs
    regime_data = tpl.get("tax_regime", {})
    slabs_data = regime_data.pop("slabs", [])
    # Deactivate existing default regimes
    db.query(TaxRegime).filter(
        TaxRegime.organization_id == org_id,
        TaxRegime.is_default.is_(True),
    ).update({"is_default": False})
    regime = TaxRegime(organization_id=org_id, **regime_data)
    db.add(regime)
    db.flush()
    for slab_data in slabs_data:
        slab = TaxSlab(tax_regime_id=regime.id, **slab_data)
        db.add(slab)
    db.flush()
    created["tax_regime"] = regime.id

    # 6. Update org defaults
    org.default_payroll_policy_id = policy.id
    org.default_attendance_policy_id = att.id
    org.default_tax_regime_id = regime.id

    db.commit()
    return created


@router.post("/industries/{industry_code}/apply")
def apply_industry_template(
    industry_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Apply an industry template to the current user's organization.

    This is one-click setup — in seconds, your org gets fully configured
    payroll, attendance, compliance, and tax settings tailored to your industry.

    Competitors (Keka, greytHR, Darwinbox) charge ₹40,000-₹1,50,000
    for this configuration and take 4-12 weeks to implement.
    """
    if industry_code not in get_industry_codes():
        available = ", ".join(get_industry_codes())
        raise HTTPException(
            status_code=404,
            detail=f"Industry template '{industry_code}' not found. Available: {available}",
        )

    org = db.query(Organization).filter(
        Organization.id == current_user.organization_id
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check if already configured
    if org.default_payroll_policy_id:
        raise HTTPException(
            status_code=409,
            detail="Organization already has a payroll policy configured. Delete existing policies first or use PUT /industries/{code}/reapply",
        )

    try:
        result = _apply_industry_to_org(db, org.id, industry_code)
        tpl = INDUSTRY_TEMPLATES[industry_code]
        return {
            "message": f"Industry template '{tpl['name']}' applied successfully",
            "industry": tpl["name"],
            "created": result,
            "note": "Your organization is now fully configured for payroll. Add employees and run your first payroll cycle.",
            "competitive_advantage": "What takes competitors 4-12 weeks and ₹40k-₹1.5L was done in 1 click.",
        }
    except Exception as e:
        db.rollback()
        logger.exception("Failed to apply industry template")
        raise HTTPException(status_code=500, detail=f"Failed to apply template: {e}")


@router.post("/industries/{industry_code}/reapply")
def reapply_industry_template(
    industry_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Reapply an industry template, replacing all existing policies.

    Deactivates old policies and creates fresh ones from the template.
    Use this when you want to switch industries or reset to defaults.
    """
    if industry_code not in get_industry_codes():
        available = ", ".join(get_industry_codes())
        raise HTTPException(
            status_code=404,
            detail=f"Industry template '{industry_code}' not found. Available: {available}",
        )

    org = db.query(Organization).filter(
        Organization.id == current_user.organization_id
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Deactivate existing policies
    db.query(PayrollPolicy).filter(
        PayrollPolicy.organization_id == org.id,
    ).update({"status": "inactive"})
    db.query(AttendancePolicy).filter(
        AttendancePolicy.organization_id == org.id,
    ).update({"status": "inactive"})
    db.query(PayrollComponent).filter(
        PayrollComponent.organization_id == org.id,
    ).update({"status": "inactive", "is_active": False})

    # Reset org defaults
    org.default_payroll_policy_id = None
    org.default_attendance_policy_id = None
    org.default_tax_regime_id = None
    db.flush()

    try:
        result = _apply_industry_to_org(db, org.id, industry_code)
        tpl = INDUSTRY_TEMPLATES[industry_code]
        return {
            "message": f"Industry template '{tpl['name']}' reapplied successfully",
            "industry": tpl["name"],
            "created": result,
        }
    except Exception as e:
        db.rollback()
        logger.exception("Failed to reapply industry template")
        raise HTTPException(status_code=500, detail=f"Failed to reapply template: {e}")


# ════════════════════════════════════════════════════════════════
# State Compliance — Auto PT/LWF engine
# ════════════════════════════════════════════════════════════════

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


@router.get("/compliance/{state_code}/pt")
def get_state_pt(state_code: str):
    """Get Professional Tax slabs for a state."""
    pt = get_pt_for_state(state_code)
    if not pt:
        raise HTTPException(status_code=404, detail=f"State '{state_code}' not found in PT database")
    return pt


@router.get("/compliance/{state_code}/lwf")
def get_state_lwf(state_code: str):
    """Get Labour Welfare Fund rates for a state."""
    lwf_data = get_lwf_for_state(state_code)
    if not lwf_data:
        raise HTTPException(status_code=404, detail=f"State '{state_code}' not found in LWF database")
    return lwf_data


class PTRequest(BaseModel):
    gross_salary: float
    state_code: str = "other"


class LWFRequest(BaseModel):
    gross_salary: float
    state_code: str


@router.post("/compliance/calculate-pt")
def calculate_professional_tax(req: PTRequest, db: Session = Depends(get_db)):
    """Calculate monthly Professional Tax for a given salary and state.

    This is what competitors charge extra for — we give it free and automatic.
    Keka requires manual PT slab updates when states revise rates.
    Uses the effective-dated DB slabs when available, otherwise the static table.
    """
    try:
        from services.compliance_engine import calculate_professional_tax as engine_pt
        from datetime import date as _date
        result = engine_pt(req.gross_salary, req.state_code, db=db, as_of=_date.today())
        amount = result.get("amount", 0.0)
        state_name = result.get("state", "Unknown")
        pt_config = get_pt_for_state(req.state_code) or get_pt_for_state("other")
        return {
            "gross_salary": req.gross_salary,
            "state_code": req.state_code,
            "state_name": state_name,
            "monthly_pt": amount,
            "annual_pt": amount * 12,
            "source": result.get("source", "static"),
            "slabs_applied": pt_config["slabs"] if pt_config else [],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/compliance/calculate-lwf")
def calculate_lwf_endpoint(req: LWFRequest, db: Session = Depends(get_db)):
    """Calculate monthly LWF contributions for a given salary and state."""
    try:
        from services.compliance_engine import calculate_lwf as engine_lwf
        from datetime import date as _date
        result = engine_lwf(req.gross_salary, req.state_code, db=db, as_of=_date.today())
        lwf_config = get_lwf_for_state(req.state_code)
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
