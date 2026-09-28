"""Filing calendar: statutory due dates + filed-status tracking.

One place answers "what do we owe, to whom, by when, and is it done?".

Due-date defaults follow common Indian statutory deadlines and are treated as
CONFIGURATION, not law code: every entry can be overridden per org via

    org.settings.payroll.filing_due_dates = {
        "EPF_ECR": {"day": 15, "month_offset": 1},
        "TDS_QUARTERLY": {"day": 31, "month_offset": 1},
    }

Filed status lives in org.settings.payroll.filing_status keyed by
"<CODE>:<YYYY-MM>" (or "<CODE>:<YYYY-Qn>" for quarterly) so the calendar works
without schema migrations and exports cleanly with org settings.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from models import Employee, Organization, Payroll

# month_offset = months after the PERIOD END that payment/filing is due.
FILING_DEFINITIONS: List[Dict[str, Any]] = [
    {
        "code": "EPF_ECR",
        "name": "PF ECR + payment",
        "authority": "EPFO",
        "period_type": "monthly",
        "due": {"day": 15, "month_offset": 1},
        "amount_key": "pf_total",
    },
    {
        "code": "ESI_RETURN",
        "name": "ESI return + payment",
        "authority": "ESIC",
        "period_type": "monthly",
        "due": {"day": 15, "month_offset": 1},
        "amount_key": "esi_total",
    },
    {
        "code": "PT_STATEMENT",
        "name": "Professional tax statement",
        "authority": "State",
        "period_type": "monthly",
        "due": {"day": 20, "month_offset": 1},
        "amount_key": "professional_tax",
    },
    {
        "code": "LWF_RETURN",
        "name": "Labour welfare fund return",
        "authority": "State",
        "period_type": "half_yearly",
        "due": {"day": 31, "month_offset": 1},
        "amount_key": "lwf_total",
    },
    {
        "code": "TDS_QUARTERLY",
        "name": "TDS return (Form 24Q)",
        "authority": "Income Tax",
        "period_type": "quarterly",
        "due": {"day": 31, "month_offset": 1, "q4_month_offset": 2},
        "amount_key": "tds",
    },
]

# TDS quarterly period labels: quarter end month -> filing month key.
_QUARTER_ENDS = {
    1: (4, 6, "Q1"), 2: (7, 9, "Q2"), 3: (10, 12, "Q3"), 4: (1, 3, "Q4"),
}


def _quarter_of(month: int) -> int:
    if month in (4, 5, 6):
        return 1
    if month in (7, 8, 9):
        return 2
    if month in (10, 11, 12):
        return 3
    return 4


def _half_of(month: int) -> int:
    return 1 if month <= 6 else 2


def _period_key(code: str, period_type: str, month: int, year: int) -> str:
    if period_type == "quarterly":
        return f"{code}:{year}-Q{_quarter_of(month)}"
    if period_type == "half_yearly":
        return f"{code}:{year}-H{_half_of(month)}"
    return f"{code}:{year}-{month:02d}"


def _due_date(due: Dict[str, Any], period_type: str, month: int, year: int) -> date:
    """Due date for a filing period: period end + month_offset, then `day`."""
    day = int(due.get("day") or 15)
    offset = int(due.get("month_offset") or 1)
    if period_type == "quarterly":
        q = _quarter_of(month)
        if q == 4 and due.get("q4_month_offset") is not None:
            # e.g. Form 24Q for Jan-Mar is due two months after quarter end.
            offset = int(due.get("q4_month_offset"))
        end_month = _QUARTER_ENDS[q][1]
        y, m = year, end_month + offset
    elif period_type == "half_yearly":
        end_month = 6 if _half_of(month) == 1 else 12
        y, m = year, end_month + offset
    else:
        y, m = year, month + offset
    while m > 12:
        m -= 12
        y += 1
    # Clamp to last day of month (e.g. 31 Feb -> 28/29).
    import calendar
    return date(y, m, min(day, calendar.monthrange(y, m)[1]))


def _iter_periods(period_type: str, today: date, lookback: int, horizon: int) -> List[tuple]:
    """(month, year) anchors to display for each period type."""
    out: List[tuple] = []
    if period_type == "monthly":
        y, m = today.year, today.month
        for _ in range(lookback):
            m -= 1
            if m == 0:
                m, y = 12, y - 1
        # lookback past + current + horizon future periods
        for _ in range(lookback + 1 + horizon):
            out.append((m, y))
            m += 1
            if m == 13:
                m, y = 1, y + 1
        return out
    if period_type == "quarterly":
        for q in range(1, 5):
            out.append((_QUARTER_ENDS[q][1], today.year))
        return out
    return [(6, today.year), (12, today.year)]


def _period_amounts(db: Session, org_id: int, period_type: str, month: int, year: int) -> Dict[str, float]:
    """Statutory liabilities for a filing period (sums over processed payrolls)."""
    q = (
        db.query(Payroll)
        .filter(Payroll.deleted_at.is_(None), Payroll.year == year, Payroll.status.in_(["draft", "processed", "paid"]))
    )
    if org_id:
        q = q.filter(Payroll.organization_id == org_id)
    if period_type == "monthly":
        q = q.filter(Payroll.month == month)
    elif period_type == "quarterly":
        start, end, _ = _QUARTER_ENDS[_quarter_of(month)]
        q = q.filter(Payroll.month >= start, Payroll.month <= end)
    else:
        start, end = (1, 6) if _half_of(month) == 1 else (7, 12)
        q = q.filter(Payroll.month >= start, Payroll.month <= end)

    def s(attr: str) -> float:
        return round(sum(float(getattr(p, attr) or 0) for p in q.all()), 2)

    totals = {
        "pf_employee": s("pf_deduction"),
        "pf_employer": s("pf_employer_contribution"),
        "esi_employee": s("esi_deduction"),
        "esi_employer": s("esi_employer_contribution"),
        "professional_tax": s("professional_tax"),
        "lwf_employee": s("lwf_deduction"),
        "lwf_employer": s("lwf_employer_contribution"),
        "tds": s("tds_deduction"),
    }
    totals["pf_total"] = round(totals["pf_employee"] + totals["pf_employer"], 2)
    totals["esi_total"] = round(totals["esi_employee"] + totals["esi_employer"], 2)
    totals["lwf_total"] = round(totals["lwf_employee"] + totals["lwf_employer"], 2)
    return totals


def _filing_status(org: Organization) -> Dict[str, Any]:
    return ((org.settings or {}).get("payroll", {}) or {}).get("filing_status", {}) or {}


def _due_overrides(org: Organization) -> Dict[str, Any]:
    return ((org.settings or {}).get("payroll", {}) or {}).get("filing_due_dates", {}) or {}


def build_calendar(
    db: Session,
    org_id: int,
    *,
    today: Optional[date] = None,
    lookback: int = 1,
    horizon: int = 3,
) -> List[Dict[str, Any]]:
    """Upcoming + recent filing obligations with amounts, due dates and status."""
    today = today or date.today()
    org = db.query(Organization).filter(Organization.id == org_id).first() if org_id else None
    filed_map = _filing_status(org) if org is not None else {}
    overrides = _due_overrides(org) if org is not None else {}

    items: List[Dict[str, Any]] = []
    for filing in FILING_DEFINITIONS:
        due_cfg = {**(filing.get("due") or {}), **(overrides.get(filing["code"]) or {})}
        for month, year in _iter_periods(filing["period_type"], today, lookback, horizon):
            due = _due_date(due_cfg, filing["period_type"], month, year)
            key = _period_key(filing["code"], filing["period_type"], month, year)
            entry = filed_map.get(key) or {}
            if entry.get("filedAt"):
                status = "filed"
            elif due < today:
                status = "overdue"
            elif (due - today).days <= 7:
                status = "due_soon"
            else:
                status = "upcoming"
            amounts = _period_amounts(db, org_id, filing["period_type"], month, year)
            label_month, label_year = month, year
            if filing["period_type"] == "quarterly":
                label = f"{_QUARTER_ENDS[_quarter_of(month)][2]} {year}"
            elif filing["period_type"] == "half_yearly":
                label = f"H{_half_of(month)} {year}"
            else:
                label = f"{date(year, month, 1).strftime('%b %Y')}"
            items.append({
                "code": filing["code"],
                "name": filing["name"],
                "authority": filing["authority"],
                "periodType": filing["period_type"],
                "periodKey": key,
                "periodLabel": label,
                "periodMonth": label_month,
                "periodYear": label_year,
                "dueDate": due.isoformat(),
                "status": status,
                "amount": amounts.get(filing.get("amount_key") or "", 0.0),
                "amountKey": filing.get("amount_key"),
                "totals": amounts,
                "filedAt": entry.get("filedAt"),
                "filedByName": entry.get("filedByName"),
                "notes": entry.get("notes"),
            })
    items.sort(key=lambda i: (i["dueDate"], i["code"]))
    return items


def mark_filed(
    db: Session,
    org: Organization,
    *,
    code: str,
    period_key: str,
    user_id: int,
    user_name: str = "",
    notes: str = "",
) -> Dict[str, Any]:
    settings = dict(org.settings or {})
    payroll_settings = dict(settings.get("payroll", {}) or {})
    filing_status = dict(payroll_settings.get("filing_status", {}) or {})
    filing_status[period_key] = {
        "code": code,
        "filedAt": datetime.utcnow().isoformat(),
        "filedBy": user_id,
        "filedByName": user_name,
        "notes": notes or "",
    }
    payroll_settings["filing_status"] = filing_status
    settings["payroll"] = payroll_settings
    org.settings = settings
    return filing_status[period_key]


def unmark_filed(db: Session, org: Organization, period_key: str) -> bool:
    settings = dict(org.settings or {})
    payroll_settings = dict(settings.get("payroll", {}) or {})
    filing_status = dict(payroll_settings.get("filing_status", {}) or {})
    if period_key not in filing_status:
        return False
    del filing_status[period_key]
    payroll_settings["filing_status"] = filing_status
    settings["payroll"] = payroll_settings
    org.settings = settings
    return True
