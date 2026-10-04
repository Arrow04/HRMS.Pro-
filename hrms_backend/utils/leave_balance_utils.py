"""Shared leave-balance helpers: config maps, type matching, scoped resolution.

Single source of truth used by routers.leaves (init-all, auto-init) and
services.onboarding_automation (joiner provisioning) so every path resolves
the same quota for the same employee — no drift, no double counting.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional


# Scoped-config field -> (legacy code, label). Codes are matched tolerantly
# (see _norm_leave_code), so legacy CL/SL/EL/ML and master codes like
# casual_leave / sick_leave / earned_leave all resolve.
LEAVE_CONFIG_MAP = {
    "casual": ("CL", "casual"),
    "sick": ("SL", "sick"),
    "earned": ("EL", "earned"),
    "maternity": ("ML", "maternity"),
}

# Legacy short codes <-> master-data codes (CL <-> casual_leave, ...).
LEAVE_CODE_ALIASES = {
    "CL": "CASUALLEAVE", "SL": "SICKLEAVE", "EL": "EARNEDLEAVE",
    "PL": "EARNEDLEAVE", "ML": "MATERNITYLEAVE",
}


def _norm_leave_code(code: Any) -> str:
    norm = re.sub(r"[^A-Z]", "", (code or "").upper())
    return LEAVE_CODE_ALIASES.get(norm, norm)


def match_leave_type(leave_types: List[Any], code: Any) -> Optional[Any]:
    """Find a LeaveType by code, tolerant of legacy/master naming differences."""
    want = _norm_leave_code(code)
    for t in leave_types:
        if _norm_leave_code(getattr(t, "code", None)) == want:
            return t
    return None


def config_days_for_type(config: Optional[Dict[str, Any]], type_code: Any, type_name: Any = None) -> Optional[int]:
    """Days for a leave type from a scoped config (None when not configured).

    Understands BOTH shapes: the current scoped shape
    (config["leaveTypes"] = [{code, name, days_per_year, active, ...}]) and
    legacy flat fields (config["casual"]).
    """
    if not config:
        return None
    want = {_norm_leave_code(type_code), _norm_leave_code(type_name)} - {""}
    # Current shape: leaveTypes[] entries matched by code or name.
    for e in config.get("leaveTypes") or []:
        if _norm_leave_code(e.get("code")) in want or _norm_leave_code(e.get("name")) in want:
            if e.get("active") is False:
                return 0
            try:
                return max(0, int(e.get("days_per_year", 0)))
            except (TypeError, ValueError):
                return 0
    # Legacy flat shape.
    for field, (code, _label) in LEAVE_CONFIG_MAP.items():
        if _norm_leave_code(code) == _norm_leave_code(type_code):
            try:
                val = config.get(field)
                return int(val) if val is not None else None
            except (TypeError, ValueError):
                return None
    return None


def single_policy_days(single_policy: Optional[Dict[str, Any]], code: Any, name: Any) -> Optional[int]:
    """Days from the org-wide single leave policy (settings['leave']).

    Keys are flat (casual/sick/earned/maternity/annualLeave/...); matched
    tolerantly — exact first, then prefix either-way.
    """
    if not single_policy:
        return None
    want = {_norm_leave_code(code), _norm_leave_code(name)} - {""}
    if not want:
        return None
    items = [(_norm_leave_code(k), v) for k, v in single_policy.items()]
    for norm_key, val in items:
        if norm_key and norm_key in want:
            try:
                return max(0, int(val))
            except (TypeError, ValueError):
                return None
    for norm_key, val in items:
        if norm_key and len(norm_key) >= 4 and any(
            len(w) >= 4 and (norm_key.startswith(w) or w.startswith(norm_key)) for w in want
        ):
            try:
                return max(0, int(val))
            except (TypeError, ValueError):
                return None
    return None


def active_leave_types(db, org_id) -> List[Any]:
    """Org's own active types + universal (global) defaults."""
    from sqlalchemy import or_ as _or_

    from models import LeaveType

    return db.query(LeaveType).filter(
        LeaveType.status == "active",
        _or_(
            LeaveType.organization_id == org_id,
            LeaveType.organization_id.is_(None),
        ) if org_id else True,
    ).all()


def employee_branch_ids(db, employee_id: int) -> List[int]:
    try:
        from sqlalchemy import text as _text

        rows = db.execute(
            _text("SELECT branch_id FROM employee_branches WHERE employee_id = :eid"),
            {"eid": employee_id},
        ).fetchall()
        return [r[0] for r in rows if r[0] is not None]
    except Exception:
        return []


def resolve_leave_config(db, employee_id: int, organization_id) -> Optional[Dict[str, Any]]:
    """Resolve leave config for an employee from Organization.settings.leave_configs.

    Priority: Company-specific > Branch-specific > Department-specific > Org-wide.
    """
    from models import Employee, Organization

    org = db.query(Organization).filter(Organization.deleted_at.is_(None), Organization.id == organization_id).first()
    if not org:
        return None
    data = org.settings or {}
    configs = data.get("leave_configs") or []
    if not configs:
        return None

    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        return None

    branch_ids = employee_branch_ids(db, employee_id)

    def score(c):
        cid = c.get("companyId")
        bid = c.get("branchId")
        did = c.get("departmentId")
        rank = 3 if did is not None else 2 if bid is not None else 1 if cid is not None else 0
        cm = (cid is None) or (emp.company_id is not None and cid == emp.company_id)
        bm = (bid is None) or (bid in branch_ids)
        dm = (did is None) or (emp.department_id is not None and did == emp.department_id)
        if not (cm and bm and dm):
            return (-1, -1, -1, -1)
        return (rank, 1 if cm else 0, 1 if bm else 0, 1 if dm else 0)

    best = max(configs, key=score, default=None)
    if best and score(best)[0] >= 0:
        return best
    return None


def org_single_leave_policy(db, org_id) -> Dict[str, Any]:
    """The org-wide single leave policy (settings['leave']) — quota middle layer."""
    if not org_id:
        return {}
    try:
        from models import Organization

        org = db.query(Organization).filter(Organization.id == org_id).first()
        return ((org.settings or {}).get("leave") or {}) if org else {}
    except Exception:
        return {}


def quota_for_type(
    config: Optional[Dict[str, Any]],
    leave_type: Any,
    single_policy: Optional[Dict[str, Any]] = None,
) -> int:
    """Final quota for a type.

    Precedence: scoped config entry -> org single leave policy -> the type's
    own Days/Year (Configure Leave Type). Never negative.
    """
    code = getattr(leave_type, "code", None)
    name = getattr(leave_type, "name", None)
    if config:
        days = config_days_for_type(config, code, name)
        if days is not None:
            return days
    if single_policy:
        days = single_policy_days(single_policy, code, name)
        if days is not None:
            return days
    return max(0, int(getattr(leave_type, "days_allowed", None) or 0))


def _in_force(effective_from: Any, as_of: Any) -> bool:
    """A template/policy version applies when its effective date is reached.

    NULL effective_from = in force since forever. Future-dated versions never
    leak into current calculations.
    """
    if not effective_from or not as_of:
        return True
    try:
        eff = effective_from.date() if hasattr(effective_from, "date") else effective_from
        ref = as_of.date() if hasattr(as_of, "date") else as_of
        return eff <= ref
    except Exception:
        return True


def template_days_for_type(template_body: Optional[Dict[str, Any]], leave_type: Any) -> Optional[int]:
    """Days for a type from a pinned leave template body (None when absent).

    Matches by leave_type_id first, then tolerant code/name. An inactive row
    yields 0 (explicit zero, still creates a visible zero-quota row).

    When the body carries a template-level `_max_balance_cap` (injected by
    pinned_template_body from LeaveTemplate.max_balance_cap), the resolved
    days are capped at it.
    """
    if not template_body:
        return None
    cap = None
    try:
        cap = int(template_body.get("_max_balance_cap") or 0) or None
    except (TypeError, ValueError):
        cap = None

    def _apply_cap(days):
        if days is None or not cap:
            return days
        return min(days, cap)

    lt_id = getattr(leave_type, "id", None)
    want = {_norm_leave_code(getattr(leave_type, "code", None)), _norm_leave_code(getattr(leave_type, "name", None))} - {""}
    for row in template_body.get("leaveTypes") or []:
        code_hit = _norm_leave_code(row.get("code")) in want
        name_hit = _norm_leave_code(row.get("name")) in want
        hit = (lt_id is not None and row.get("leave_type_id") == lt_id) or code_hit or name_hit
        if not hit:
            continue
        if row.get("active") is False:
            return _apply_cap(0)
        try:
            return _apply_cap(max(0, int(row.get("days", 0))))
        except (TypeError, ValueError):
            return _apply_cap(0)
    return None


def pinned_template_body(db, employee, as_of=None) -> Optional[Dict[str, Any]]:
    """The employee's pinned leave template body (None when unpinned/missing).

    Respects effective_from: a future-dated template falls through to the
    next quota layer instead of applying early.
    """
    from datetime import date as _date

    as_of = as_of or _date.today()
    tid = getattr(employee, "leave_template_id", None)
    if not tid:
        return None
    try:
        from models import LeaveTemplate

        t = db.query(LeaveTemplate).filter(
            LeaveTemplate.id == tid,
            LeaveTemplate.deleted_at.is_(None),
            LeaveTemplate.status == "active",
        ).first()
        if not t or not _in_force(getattr(t, "effective_from", None), as_of):
            return None
        body = dict(t.body or {})
        # Template-level cap (LeaveTemplate.max_balance_cap) rides along so
        # quota resolution can honour it; truthy values only.
        cap = getattr(t, "max_balance_cap", None)
        if cap:
            try:
                body["_max_balance_cap"] = int(cap)
            except (TypeError, ValueError):
                pass
        return body
    except Exception:
        return None


def quota_for_employee(db, employee, leave_type: Any, as_of=None) -> int:
    """Full precedence for one employee+type.

    Pinned template -> payroll-template linked template -> scoped config ->
    single policy -> type Days/Year.
    """
    from datetime import date as _date

    as_of = as_of or _date.today()
    body = pinned_template_body(db, employee, as_of)
    if body:
        days = template_days_for_type(body, leave_type)
        if days is not None:
            return days
    # Company default: the employee's payroll template can link a leave
    # template, covering everyone without an individual pin.
    try:
        pt_id = getattr(employee, "payroll_template_id", None)
        if pt_id:
            from models import PayrollTemplate

            pt = db.query(PayrollTemplate).filter(PayrollTemplate.id == pt_id).first()
            lt_id = getattr(pt, "leave_template_id", None) if pt else None
            if lt_id:
                from models import LeaveTemplate

                lt = db.query(LeaveTemplate).filter(
                    LeaveTemplate.id == lt_id,
                    LeaveTemplate.deleted_at.is_(None),
                    LeaveTemplate.status == "active",
                ).first()
                if lt and _in_force(getattr(lt, "effective_from", None), as_of):
                    days = template_days_for_type(lt.body or {}, leave_type)
                    if days is not None:
                        cap = getattr(lt, "max_balance_cap", None)
                        if cap:
                            days = min(days, int(cap))
                        return days
    except Exception:
        pass
    config = resolve_leave_config(db, employee.id, getattr(employee, "organization_id", None))
    single = org_single_leave_policy(db, getattr(employee, "organization_id", None))
    return quota_for_type(config, leave_type, single)


def resolve_quota(body, config, single_policy, leave_type) -> int:
    """Quota from preloaded context (pinned body + config + single policy).

    Same precedence as quota_for_employee, without re-querying per type —
    use in bulk loops. The body must already be effective-dated by the caller
    (see pinned_template_body).
    """
    if body:
        days = template_days_for_type(body, leave_type)
        if days is not None:
            return days
    return quota_for_type(config, leave_type, single_policy)


def template_flags_map(template_body: Optional[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Per-type paid/encashable/active flags from a template body, keyed by
    normalized code. Used to resolve flags through the same precedence as
    quotas so company templates genuinely override org defaults."""
    out: Dict[str, Dict[str, Any]] = {}
    for row in (template_body or {}).get("leaveTypes") or []:
        key = _norm_leave_code(row.get("code")) or _norm_leave_code(row.get("name"))
        if not key:
            continue
        out[key] = {
            "paid": row.get("paid", True),
            "encashable": bool(row.get("encashable", False)),
            "active": row.get("active", True) is not False,
        }
    return out


def resolve_type_flags(db, employee, leave_types: List[Any], as_of=None) -> Dict[Any, Dict[str, Any]]:
    """Resolve paid/encashable per leave type for one employee.

    Precedence: pinned template row -> payroll-template linked row ->
    LeaveType org default. Keys are leave-type ids.
    """
    from datetime import date as _date

    as_of = as_of or _date.today()
    merged: Dict[str, Dict[str, Any]] = {}
    # Lowest precedence first so higher layers overwrite.
    try:
        pt_id = getattr(employee, "payroll_template_id", None)
        if pt_id:
            from models import PayrollTemplate

            pt = db.query(PayrollTemplate).filter(PayrollTemplate.id == pt_id).first()
            lt_id = getattr(pt, "leave_template_id", None) if pt else None
            if lt_id:
                from models import LeaveTemplate

                lt = db.query(LeaveTemplate).filter(
                    LeaveTemplate.id == lt_id,
                    LeaveTemplate.deleted_at.is_(None),
                    LeaveTemplate.status == "active",
                ).first()
                if lt and _in_force(getattr(lt, "effective_from", None), as_of):
                    merged.update(template_flags_map(lt.body or {}))
    except Exception:
        pass
    try:
        body = pinned_template_body(db, employee, as_of)
        merged.update(template_flags_map(body))
    except Exception:
        pass
    out: Dict[Any, Dict[str, Any]] = {}
    for lt in leave_types or []:
        key = _norm_leave_code(getattr(lt, "code", None)) or _norm_leave_code(getattr(lt, "name", None))
        row = merged.get(key, {})
        out[getattr(lt, "id", None)] = {
            "paid": row.get("paid", getattr(lt, "is_paid", True)),
            "encashable": row.get("encashable", getattr(lt, "is_encashable", False)),
        }
    return out
