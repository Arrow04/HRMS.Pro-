"""Company-wise Payroll Template CRUD.

A payroll template bundles every payroll decision into one reusable package:
PayrollPolicy + PayrollComponents, AttendancePolicy, TaxRegime (+ slabs),
Statutory overrides and State Compliance (country + registered_state).

Created from the "Configure Payroll" flow, selected on the employee form, and
used automatically by the payroll page's Run Payroll button.

Each template owns its own policy / attendance / tax regime / components so
editing one company's template never touches another's config.
"""
from typing import Any, Dict, List, Optional
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from core.auth import get_current_user
from core.company_scope import resolve_company_scope, assert_company_allowed, require_write_company
from models import (
    AttendancePolicy, Company, Employee, Organization, PayrollComponent,
    PayrollPolicy, PayrollTemplate, StatutorySetting, TaxRegime, TaxSlab, User,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/payroll-templates", tags=["Payroll Templates"])


# ── Helpers ──

def _to_snake(name: str) -> str:
    out = []
    for ch in name:
        if ch.isupper():
            out.append("_" + ch.lower())
        else:
            out.append(ch)
    return "".join(out).lstrip("_")


def _norm(obj: Any) -> Any:
    """Recursively normalise camelCase keys to snake_case."""
    if isinstance(obj, dict):
        return {_to_snake(k): _norm(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_norm(i) for i in obj]
    return obj


def _pick(src: dict, *keys):
    return {k: v for k, v in src.items() if k in keys and v is not None}


def _as_bool(v):
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    return str(v).lower() in ("1", "true", "yes", "on")


def _as_float(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _as_int(v):
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _resolve_org(db: Session, user: User) -> Organization:
    org = db.query(Organization).filter(
        Organization.id == user.organization_id,
        Organization.deleted_at.is_(None),
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


def _resolve_company(db: Session, org: Organization, company_id: Optional[int]) -> Optional[Company]:
    if company_id is None:
        return None
    company = db.query(Company).filter(
        Company.id == company_id,
        Company.organization_id == org.id,
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail=f"Company {company_id} not found in this organization")
    return company


def _load_template(db: Session, org: Organization, template_id: int) -> PayrollTemplate:
    tpl = db.query(PayrollTemplate).filter(
        PayrollTemplate.id == template_id,
        PayrollTemplate.organization_id == org.id,
        PayrollTemplate.deleted_at.is_(None),
    ).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Payroll template not found")
    return tpl


# ── Serializers ──

def _ser_policy(p: PayrollPolicy) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "pro_ration_method": p.pro_ration_method,
        "rounding_method": p.rounding_method,
        "decimal_places": p.decimal_places,
        "round_net_salary": p.round_net_salary,
        "include_gratuity": p.include_gratuity,
        "gratuity_rate": p.gratuity_rate,
        "default_currency": p.default_currency,
        "allow_negative_net": p.allow_negative_net,
        "daily_rate_divisor": p.daily_rate_divisor,
        "monthly_divisor_for_weekly": p.monthly_divisor_for_weekly,
    }


def _ser_component(c: PayrollComponent) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "display_name": c.display_name,
        "component_type": c.component_type,
        "calculation_type": c.calculation_type,
        "calculation_base": c.calculation_base,
        "calculation_value": c.calculation_value,
        "formula": c.formula,
        "max_cap": c.max_cap,
        "min_cap": c.min_cap,
        "is_statutory": c.is_statutory,
        "is_taxable": c.is_taxable,
        "is_tax_exempt": c.is_tax_exempt,
        "tax_exempt_limit": c.tax_exempt_limit,
        "apply_pro_ration": c.apply_pro_ration,
        "is_active": c.is_active,
        "is_system": c.is_system,
        "priority": c.priority,
        "tax_category": c.tax_category,
        "taxability": getattr(c, "taxability", None),
        "pf_applicable": getattr(c, "pf_applicable", None),
        "esi_applicable": getattr(c, "esi_applicable", None),
        "pt_applicable": getattr(c, "pt_applicable", None),
        "lwf_applicable": getattr(c, "lwf_applicable", None),
        "gratuity_applicable": getattr(c, "gratuity_applicable", None),
        "bonus_applicable": getattr(c, "bonus_applicable", None),
        "nps_applicable": getattr(c, "nps_applicable", None),
    }


def _ser_attendance(a: AttendancePolicy) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "working_days_per_week": a.working_days_per_week,
        "working_days": a.working_days,
        "half_day_as_full_paid": a.half_day_as_full_paid,
        "paid_leave_as_present": a.paid_leave_as_present,
        "holiday_as_present": a.holiday_as_present,
        "overtime_threshold_hours": a.overtime_threshold_hours,
        "overtime_rate": a.overtime_rate,
        "late_mark_threshold_minutes": a.late_mark_threshold_minutes,
        "half_day_threshold_hours": a.half_day_threshold_hours,
        "late_to_absent_count": getattr(a, "late_to_absent_count", None),
        "early_to_absent_count": getattr(a, "early_to_absent_count", None),
        "missing_checkout_rule": getattr(a, "missing_checkout_rule", None),
        "is_shared_template": bool(getattr(a, "is_shared_template", False)),
    }


def _ser_tax(t: TaxRegime) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "regime_type": t.regime_type,
        "is_active": t.is_active,
        "is_default": t.is_default,
        "financial_year": t.financial_year,
        "standard_deduction": t.standard_deduction,
        "rebate_threshold": t.rebate_threshold,
        "rebate_amount": t.rebate_amount,
        "cess_rate": t.cess_rate,
        "surcharge_config": t.surcharge_config or [],
        "section_80c_cap": t.section_80c_cap,
        "section_80d_cap": t.section_80d_cap,
        "section_80d_senior_cap": t.section_80d_senior_cap,
        "section_80ccd_1b_cap": t.section_80ccd_1b_cap,
        "section_24_home_loan_cap": t.section_24_home_loan_cap,
        "section_80c_old_cap": t.section_80c_old_cap,
        "hra_metro_pct": t.hra_metro_pct,
        "hra_non_metro_pct": t.hra_non_metro_pct,
        "hra_rent_threshold_pct": t.hra_rent_threshold_pct,
        "basic_pct_of_gross": t.basic_pct_of_gross,
        "slabs": [
            {"from_amount": s.from_amount, "to_amount": s.to_amount,
             "rate": s.rate, "sort_order": s.sort_order}
            for s in t.slabs
        ],
    }


def _ser_template(db: Session, t: PayrollTemplate, full: bool = False) -> dict:
    data = {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "company_id": t.company_id,
        "company_name": t.company.name if t.company else None,
        "country": t.country,
        "registered_state": t.registered_state,
        "status": t.status,
        "payroll_policy_id": t.payroll_policy_id,
        "attendance_policy_id": t.attendance_policy_id,
        "leave_template_id": t.leave_template_id,
        "tax_regime_id": t.tax_regime_id,
        "pay_cycle": t.pay_cycle,
        "pay_day": t.pay_day,
        "auto_payslip": bool(t.auto_payslip),
        "email_payslip": bool(t.email_payslip),
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }
    # Counts / names for list view
    policy = db.query(PayrollPolicy).filter(PayrollPolicy.id == t.payroll_policy_id).first() if t.payroll_policy_id else None
    att = db.query(AttendancePolicy).filter(AttendancePolicy.id == t.attendance_policy_id).first() if t.attendance_policy_id else None
    tax = db.query(TaxRegime).filter(TaxRegime.id == t.tax_regime_id).first() if t.tax_regime_id else None
    from models import LeaveTemplate
    leave_tpl = db.query(LeaveTemplate).filter(LeaveTemplate.id == t.leave_template_id).first() if t.leave_template_id else None
    comp_count = db.query(PayrollComponent).filter(
        PayrollComponent.payroll_policy_id == t.payroll_policy_id
    ).count() if t.payroll_policy_id else 0
    emp_count = db.query(Employee).filter(
        Employee.payroll_template_id == t.id, Employee.deleted_at.is_(None)
    ).count()
    data.update({
        "policy_name": policy.name if policy else None,
        "attendance_name": att.name if att else None,
        "leave_template_name": leave_tpl.name if leave_tpl else None,
        "tax_regime_name": tax.name if tax else None,
        "component_count": comp_count,
        "employee_count": emp_count,
    })
    if full:
        data.update({
            "payroll_policy": _ser_policy(policy) if policy else None,
            "attendance_policy": _ser_attendance(att) if att else None,
            "tax_regime": _ser_tax(tax) if tax else None,
            "components": [
                _ser_component(c) for c in db.query(PayrollComponent).filter(
                    PayrollComponent.payroll_policy_id == t.payroll_policy_id
                ).order_by(PayrollComponent.priority).all()
            ],
            "statutory": t.statutory or {},
        })
    return data


# ── Payload ──

class PayrollTemplatePayload(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    company_id: Optional[int] = Field(default=None, alias="companyId")
    country: Optional[str] = None
    registered_state: Optional[str] = Field(default=None, alias="registeredState")
    status: Optional[str] = None
    payroll_policy: Optional[Dict[str, Any]] = Field(default=None, alias="payrollPolicy")
    components: Optional[List[Dict[str, Any]]] = None
    statutory: Optional[Dict[str, Any]] = None
    tax_regime: Optional[Dict[str, Any]] = Field(default=None, alias="taxRegime")
    attendance_policy: Optional[Dict[str, Any]] = Field(default=None, alias="attendancePolicy")
    attendance_policy_id: Optional[int] = Field(default=None, alias="attendancePolicyId")
    leave_template_id: Optional[int] = Field(default=None, alias="leaveTemplateId")
    pay_cycle: Optional[str] = Field(default=None, alias="payCycle")
    pay_day: Optional[int] = Field(default=None, alias="payDay")
    auto_payslip: Optional[bool] = Field(default=None, alias="autoPayslip")
    email_payslip: Optional[bool] = Field(default=None, alias="emailPayslip")

    model_config = {"populate_by_name": True}


# ── Mutators ──

POLICY_KEYS = ("name", "pro_ration_method", "rounding_method", "decimal_places",
               "round_net_salary", "include_gratuity", "gratuity_rate",
               "default_currency", "allow_negative_net",
               "daily_rate_divisor", "monthly_divisor_for_weekly")
ATT_KEYS = ("name", "working_days_per_week", "working_days", "half_day_as_full_paid",
            "paid_leave_as_present", "holiday_as_present", "overtime_threshold_hours",
            "overtime_rate", "late_mark_threshold_minutes", "half_day_threshold_hours",
            "late_to_absent_count", "early_to_absent_count", "missing_checkout_rule")
TAX_KEYS = ("name", "regime_type", "is_active", "is_default", "financial_year",
            "standard_deduction", "rebate_threshold", "rebate_amount", "cess_rate",
            "surcharge_config",
            "section_80c_cap", "section_80d_cap", "section_80d_senior_cap",
            "section_80ccd_1b_cap", "section_24_home_loan_cap", "section_80c_old_cap",
            "hra_metro_pct", "hra_non_metro_pct", "hra_rent_threshold_pct",
            "basic_pct_of_gross")
COMPONENT_KEYS = ("name", "display_name", "component_type", "calculation_type",
                  "calculation_base", "calculation_value", "formula", "max_cap",
                  "min_cap", "is_statutory", "is_taxable", "is_tax_exempt",
                  "tax_exempt_limit", "apply_pro_ration", "is_active", "priority",
                  "tax_category", "taxability", "pf_applicable", "esi_applicable",
                  "pt_applicable", "lwf_applicable", "gratuity_applicable",
                  "bonus_applicable", "nps_applicable")
STATUTORY_KEYS = ("pf_applicable", "pf_employee_rate", "pf_employer_rate",
                  "pf_wage_ceiling", "pf_max_monthly", "pf_min_basic_for_exclusion",
                  "pf_edli_rate", "pf_edli_max_monthly", "pf_admin_rate", "pf_admin_min_monthly",
                  "eps_wage_ceiling",
                  "esi_applicable", "esi_employee_rate", "esi_employer_rate", "esi_gross_ceiling",
                  "esi_disabled_ceiling",
                  "pt_applicable", "pt_monthly_amount", "pt_min_gross",
                  "lwf_applicable", "lwf_employee_rate", "lwf_employer_rate",
                  "gratuity_applicable", "gratuity_rate", "gratuity_eligible_years",
                  "gratuity_days_per_year", "gratuity_tax_exempt_ceiling",
                  "bonus_applicable", "bonus_min_rate", "bonus_max_rate", "bonus_wage_ceiling")


def _create_policy(db, org_id, data: dict) -> PayrollPolicy:
    clean = _pick(data, *POLICY_KEYS)
    policy = PayrollPolicy(organization_id=org_id, **clean)
    db.add(policy)
    db.flush()
    return policy


def _create_attendance(db, org_id, data: dict) -> AttendancePolicy:
    clean = _pick(data, *ATT_KEYS)
    att = AttendancePolicy(organization_id=org_id, **clean)
    db.add(att)
    db.flush()
    return att


def _create_tax_regime(db, org_id, data: dict) -> TaxRegime:
    clean = _pick(data, *TAX_KEYS)
    regime = TaxRegime(organization_id=org_id, **clean)
    db.add(regime)
    db.flush()
    for slab in data.get("slabs") or []:
        db.add(TaxSlab(
            tax_regime_id=regime.id,
            from_amount=float(slab.get("from_amount", 0) or 0),
            to_amount=float(slab["to_amount"]) if slab.get("to_amount") is not None else None,
            rate=float(slab.get("rate", 0) or 0),
            sort_order=int(slab.get("sort_order", 0) or 0),
        ))
    db.flush()
    return regime


def _create_components(db, org_id, policy_id, comps: List[dict]) -> List[int]:
    ids = []
    for i, c in enumerate(comps or []):
        clean = _pick(c, *COMPONENT_KEYS)
        clean.setdefault("name", f"Component {i + 1}")
        clean.setdefault("priority", i)
        comp = PayrollComponent(organization_id=org_id, payroll_policy_id=policy_id, **clean)
        db.add(comp)
        db.flush()
        ids.append(comp.id)
    return ids


def _clean_statutory(raw: dict) -> dict:
    out = {}
    for k in STATUTORY_KEYS:
        if k not in raw:
            continue
        v = raw[k]
        if k.startswith(("pf_", "esi_", "eps_", "pt_", "lwf_", "gratuity_", "bonus_")):
            if k.endswith("_applicable"):
                out[k] = _as_bool(v)
            else:
                out[k] = _as_float(v)
        else:
            out[k] = v
    return out


# ── Endpoints ──

@router.get("")
def list_templates(
    company_id: Optional[int] = Query(default=None, alias="companyId"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = _resolve_org(db, current_user)
    q = db.query(PayrollTemplate).filter(
        PayrollTemplate.organization_id == org.id,
        PayrollTemplate.deleted_at.is_(None),
    )
    company_id = resolve_company_scope(db, current_user, company_id)
    if company_id is not None:
        q = q.filter(PayrollTemplate.company_id == company_id)
    return [_ser_template(db, t) for t in q.order_by(PayrollTemplate.name).all()]


@router.get("/{template_id}")
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = _resolve_org(db, current_user)
    tpl = _load_template(db, org, template_id)
    assert_company_allowed(db, current_user, tpl.company_id)
    return _ser_template(db, tpl, full=True)


@router.post("")
def create_template(
    payload: PayrollTemplatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = _resolve_org(db, current_user)
    body = _norm(payload.model_dump(by_alias=False, exclude_unset=True))
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="Template name is required")
    company = _resolve_company(db, org, body.get("company_id"))
    if body.get("company_id") not in (None, "", 0):
        body["company_id"] = require_write_company(db, current_user, body.get("company_id"))
        company = _resolve_company(db, org, body.get("company_id"))

    policy = _create_policy(db, org.id, body.get("payroll_policy") or {})
    # Link a shared attendance template when attendance_policy_id is given;
    # otherwise create the owned policy as before.
    att = None
    linked_att_id = body.get("attendance_policy_id")
    if linked_att_id:
        att = db.query(AttendancePolicy).filter(
            AttendancePolicy.id == linked_att_id,
            AttendancePolicy.organization_id == org.id,
        ).first()
        if not att:
            raise HTTPException(status_code=400, detail="Attendance template not found")
    else:
        att = _create_attendance(db, org.id, body.get("attendance_policy") or {})
    tax = _create_tax_regime(db, org.id, body.get("tax_regime") or {})
    statutory = _clean_statutory(body.get("statutory") or {})
    leave_tpl = None
    if body.get("leave_template_id"):
        from models import LeaveTemplate
        leave_tpl = db.query(LeaveTemplate).filter(
            LeaveTemplate.id == body.get("leave_template_id"),
            LeaveTemplate.organization_id == org.id,
            LeaveTemplate.deleted_at.is_(None),
        ).first()
        if not leave_tpl:
            raise HTTPException(status_code=400, detail="Leave template not found")

    tpl = PayrollTemplate(
        organization_id=org.id,
        company_id=company.id if company else None,
        name=name,
        description=body.get("description"),
        country=body.get("country") or (company.country if company else None) or "India",
        registered_state=body.get("registered_state") or "",
        status=body.get("status") or "active",
        payroll_policy_id=policy.id,
        attendance_policy_id=att.id,
        leave_template_id=leave_tpl.id if leave_tpl else None,
        tax_regime_id=tax.id,
        statutory=statutory,
        pay_cycle=body.get("pay_cycle") or "monthly",
        pay_day=body.get("pay_day"),
        auto_payslip=_as_bool(body.get("auto_payslip")) or False,
        email_payslip=_as_bool(body.get("email_payslip")) or False,
    )
    db.add(tpl)
    db.flush()
    component_ids = _create_components(db, org.id, policy.id, body.get("components") or [])
    db.commit()
    db.refresh(tpl)
    return {
        "message": f"Payroll template '{tpl.name}' created",
        "template": _ser_template(db, tpl, full=True),
        "created": {
            "payroll_policy": policy.id,
            "attendance_policy": att.id,
            "tax_regime": tax.id,
            "components": component_ids,
        },
    }


@router.put("/{template_id}")
def update_template(
    template_id: int,
    payload: PayrollTemplatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = _resolve_org(db, current_user)
    tpl = _load_template(db, org, template_id)
    body = _norm(payload.model_dump(by_alias=False, exclude_unset=True))

    if body.get("name"):
        tpl.name = body["name"].strip()
    assert_company_allowed(db, current_user, tpl.company_id)
    if body.get("description") is not None:
        tpl.description = body.get("description")
    if "company_id" in body:
        company = _resolve_company(db, org, body.get("company_id"))
        tpl.company_id = require_write_company(db, current_user, body.get("company_id")) if body.get("company_id") not in (None, "", 0) else None
    if body.get("country"):
        tpl.country = body["country"]
    if body.get("registered_state") is not None:
        tpl.registered_state = body.get("registered_state")
    if body.get("status"):
        tpl.status = body["status"]
    if body.get("pay_cycle") is not None:
        tpl.pay_cycle = body["pay_cycle"]
    if "pay_day" in body:
        tpl.pay_day = body.get("pay_day")
    if "auto_payslip" in body:
        tpl.auto_payslip = _as_bool(body.get("auto_payslip")) or False
    if "email_payslip" in body:
        tpl.email_payslip = _as_bool(body.get("email_payslip")) or False

    if body.get("payroll_policy") and tpl.payroll_policy_id:
        policy = db.query(PayrollPolicy).filter(PayrollPolicy.id == tpl.payroll_policy_id).first()
        if policy:
            for k, v in _pick(body["payroll_policy"], *POLICY_KEYS).items():
                setattr(policy, k, v)

    # Attendance link vs owned-edit, decided by the shared marker so the
    # payroll wizard can never overwrite a shared Attendance template:
    #  - attendance_policy_id of a SHARED template -> link only, fields ignored
    #  - attendance_policy_id of an OWNED policy -> update fields in place
    #  - attendance_policy_id null + attendance_policy fields -> fresh owned copy
    #  - attendance_policy_id null without fields -> unlink (no policy)
    if "attendance_policy_id" in body or body.get("attendance_policy"):
        linked_id = body.get("attendance_policy_id")
        if linked_id:
            att = db.query(AttendancePolicy).filter(
                AttendancePolicy.id == linked_id,
                AttendancePolicy.organization_id == org.id,
            ).first()
            if not att:
                raise HTTPException(status_code=400, detail="Attendance template not found")
            tpl.attendance_policy_id = att.id
            if not getattr(att, "is_shared_template", False) and body.get("attendance_policy"):
                for k, v in _pick(body["attendance_policy"], *ATT_KEYS).items():
                    setattr(att, k, v)
        elif body.get("attendance_policy"):
            att = _create_attendance(db, org.id, body.get("attendance_policy") or {})
            tpl.attendance_policy_id = att.id
        else:
            tpl.attendance_policy_id = None
    if "leave_template_id" in body:
        leave_id = body.get("leave_template_id")
        if leave_id:
            from models import LeaveTemplate
            leave_tpl = db.query(LeaveTemplate).filter(
                LeaveTemplate.id == leave_id,
                LeaveTemplate.organization_id == org.id,
                LeaveTemplate.deleted_at.is_(None),
            ).first()
            if not leave_tpl:
                raise HTTPException(status_code=400, detail="Leave template not found")
            tpl.leave_template_id = leave_tpl.id
        else:
            tpl.leave_template_id = None

    if body.get("tax_regime") and tpl.tax_regime_id:
        tax = db.query(TaxRegime).filter(TaxRegime.id == tpl.tax_regime_id).first()
        if tax:
            for k, v in _pick(body["tax_regime"], *TAX_KEYS).items():
                setattr(tax, k, v)
            if body["tax_regime"].get("slabs") is not None:
                tax.slabs.clear()
                db.flush()
                for slab in body["tax_regime"]["slabs"]:
                    db.add(TaxSlab(
                        tax_regime_id=tax.id,
                        from_amount=float(slab.get("from_amount", 0) or 0),
                        to_amount=float(slab["to_amount"]) if slab.get("to_amount") is not None else None,
                        rate=float(slab.get("rate", 0) or 0),
                        sort_order=int(slab.get("sort_order", 0) or 0),
                    ))

    if body.get("statutory"):
        tpl.statutory = _clean_statutory(body["statutory"])

    if body.get("components") is not None and tpl.payroll_policy_id:
        db.query(PayrollComponent).filter(
            PayrollComponent.payroll_policy_id == tpl.payroll_policy_id
        ).delete(synchronize_session=False)
        db.flush()
        _create_components(db, org.id, tpl.payroll_policy_id, body["components"])

    db.commit()
    db.refresh(tpl)
    return {
        "message": f"Payroll template '{tpl.name}' updated",
        "template": _ser_template(db, tpl, full=True),
    }


@router.delete("/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    org = _resolve_org(db, current_user)
    tpl = _load_template(db, org, template_id)
    assert_company_allowed(db, current_user, tpl.company_id)
    from core.datetime_utils import ist_now_naive
    tpl.deleted_at = ist_now_naive()
    # Detach employees so they fall back to their own policy ids / org defaults.
    db.query(Employee).filter(Employee.payroll_template_id == tpl.id).update(
        {"payroll_template_id": None}
    )
    db.commit()
    return {"message": f"Payroll template '{tpl.name}' deleted", "id": tpl.id}


@router.post("/from-org")
def snapshot_from_org(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a template snapshotting the org's current default configuration."""
    org = _resolve_org(db, current_user)

    policy = None
    if org.default_payroll_policy_id:
        policy = db.query(PayrollPolicy).filter(
            PayrollPolicy.id == org.default_payroll_policy_id,
            PayrollPolicy.status == "active",
        ).first()
    if not policy:
        policy = db.query(PayrollPolicy).filter(
            PayrollPolicy.organization_id == org.id, PayrollPolicy.status == "active"
        ).order_by(PayrollPolicy.id).first()

    att = None
    if org.default_attendance_policy_id:
        att = db.query(AttendancePolicy).filter(
            AttendancePolicy.id == org.default_attendance_policy_id,
            AttendancePolicy.status == "active",
        ).first()
    if not att:
        att = db.query(AttendancePolicy).filter(
            AttendancePolicy.organization_id == org.id, AttendancePolicy.status == "active"
        ).order_by(AttendancePolicy.id).first()

    tax = None
    if org.default_tax_regime_id:
        tax = db.query(TaxRegime).filter(
            TaxRegime.id == org.default_tax_regime_id, TaxRegime.status == "active"
        ).first()
    if not tax:
        tax = db.query(TaxRegime).filter(
            TaxRegime.organization_id == org.id, TaxRegime.is_default.is_(True)
        ).order_by(TaxRegime.id).first()

    stat = db.query(StatutorySetting).filter(
        StatutorySetting.organization_id == org.id, StatutorySetting.status == "active"
    ).first()

    # Create owned copies so the template is fully independent.
    # NOTE: strip `id` and relationship keys from the serializers — we are
    # inserting brand-new rows and must not collide with the source rows.
    def _copy_kwargs(data: dict, drop: tuple = ("id",)):
        return {k: v for k, v in data.items() if k not in drop}

    new_policy = PayrollPolicy(organization_id=org.id, **_copy_kwargs(_ser_policy(policy))) if policy else PayrollPolicy(organization_id=org.id)
    db.add(new_policy)
    db.flush()
    new_att = AttendancePolicy(organization_id=org.id, **_copy_kwargs(_ser_attendance(att))) if att else AttendancePolicy(organization_id=org.id)
    db.add(new_att)
    db.flush()
    new_tax = TaxRegime(organization_id=org.id, **_copy_kwargs(_ser_tax(tax), drop=("id", "slabs"))) if tax else TaxRegime(organization_id=org.id, name="New Regime")
    db.add(new_tax)
    db.flush()
    if tax:
        for slab in tax.slabs:
            db.add(TaxSlab(
                tax_regime_id=new_tax.id, from_amount=slab.from_amount,
                to_amount=slab.to_amount, rate=slab.rate, sort_order=slab.sort_order,
            ))
    db.flush()

    statutory = {}
    if stat:
        statutory = _clean_statutory({
            "pf_applicable": stat.pf_applicable, "pf_employee_rate": stat.pf_employee_rate,
            "pf_employer_rate": stat.pf_employer_rate, "pf_max_monthly": stat.pf_max_monthly,
            "pf_min_basic_for_exclusion": stat.pf_min_basic_for_exclusion,
            "esi_applicable": stat.esi_applicable, "esi_employee_rate": stat.esi_employee_rate,
            "esi_employer_rate": stat.esi_employer_rate, "esi_gross_ceiling": stat.esi_gross_ceiling,
            "pt_applicable": stat.pt_applicable, "pt_monthly_amount": stat.pt_monthly_amount,
            "pt_min_gross": stat.pt_min_gross,
            "lwf_applicable": stat.lwf_applicable, "lwf_employee_rate": stat.lwf_employee_rate,
            "lwf_employer_rate": stat.lwf_employer_rate,
            "gratuity_applicable": stat.gratuity_applicable, "gratuity_rate": stat.gratuity_rate,
        })

    # Pay-run metadata from the org's payroll settings (fallback defaults).
    org_pay = {}
    try:
        org_pay = (org.settings or {}).get("payroll") or {}
    except Exception:
        org_pay = {}

    def _snap_bool(v, default=False):
        if isinstance(v, bool):
            return v
        return str(v).lower() in ("1", "true", "yes", "on") if v is not None else default

    pay_day = None
    try:
        pd = org_pay.get("payDay")
        if pd is not None:
            if isinstance(pd, int):
                pay_day = pd
            else:
                s = str(pd).strip().lower()
                pay_day = int(s) if s.isdigit() else None  # "last-day" -> None (last day of month)
    except (TypeError, ValueError):
        pay_day = None

    name = f"{org.name} Default"
    tpl = PayrollTemplate(
        organization_id=org.id,
        name=name,
        description="Snapshot of the organization's current payroll configuration.",
        country=getattr(org, "country", None) or "India",
        registered_state=getattr(org, "registered_state", None) or "",
        status="active",
        payroll_policy_id=new_policy.id,
        attendance_policy_id=new_att.id,
        tax_regime_id=new_tax.id,
        statutory=statutory,
        pay_cycle=org_pay.get("cycle") or "monthly",
        pay_day=pay_day,
        auto_payslip=_snap_bool(org_pay.get("autoPayslip")),
        email_payslip=_snap_bool(org_pay.get("emailPayslip")),
    )
    db.add(tpl)
    db.flush()

    src_comps = db.query(PayrollComponent).filter(
        PayrollComponent.payroll_policy_id == policy.id, PayrollComponent.is_active.is_(True)
    ).order_by(PayrollComponent.priority).all() if policy else []
    for c in src_comps:
        db.add(PayrollComponent(
            organization_id=org.id, payroll_policy_id=new_policy.id,
            **_copy_kwargs(_ser_component(c)),
        ))
    db.commit()
    db.refresh(tpl)
    return {
        "message": f"Payroll template '{tpl.name}' created from current configuration",
        "template": _ser_template(db, tpl, full=True),
    }