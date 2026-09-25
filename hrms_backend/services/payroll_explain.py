"""Payroll explainability: every payslip figure with its WHY.

Mandate section 43: show the payslip AND "why was this amount calculated?" -
each amount must reference its rule, rule version, formula, input values and
effective date. Lines are persisted with the payroll so history stays
explainable even after rules change.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

__all__ = ["build_explain_lines", "save_explain_lines", "explain_payload"]


# Line catalogue: (result key, code, label, side, wage_basis, default formula)
_EARNINGS = (
    ("basic_salary", "basic", "Basic Salary", "earning", "BASIC", "monthly basic x attendance factor"),
    ("da", "da", "Dearness Allowance", "earning", "DA", "DA component"),
    ("hra", "hra", "HRA", "earning", None, "HRA component (rule/template/fallback)"),
    ("conveyance", "conveyance", "Conveyance Allowance", "earning", None, "conveyance component"),
    ("medical", "medical", "Medical Allowance", "earning", None, "medical component"),
    ("special_allowance", "special_allowance", "Special Allowance", "earning", None, "special allowance component"),
    ("other_allowance", "other_allowance", "Other Allowance", "earning", None, "other allowance component"),
    ("overtime_pay", "overtime", "Overtime Pay", "earning", "OT_WAGES", "OT hours x rate x multiplier (rule-driven)"),
    ("bonus", "bonus", "Bonus", "earning", "BONUS_WAGES", "Payment of Bonus Act minimum, monthly"),
    ("commission", "commission", "Commission", "earning", None, "variable pay"),
    ("incentive", "incentive", "Incentive", "earning", None, "variable pay"),
    ("arrears", "arrears", "Arrears", "earning", None, "arrears engine adjustments"),
    ("leave_encashment", "leave_encashment", "Leave Encashment", "earning", None, "encashable leave days x daily rate"),
    ("other_earnings", "other_earnings", "Other Earnings", "earning", None, "other earnings"),
    ("expense_reimbursement", "reimbursement", "Expense Reimbursement", "earning", None, "approved reimbursements"),
)

_DEDUCTIONS = (
    ("pf_deduction", "pf", "Provident Fund", "deduction", "PF_WAGES", "MIN(PF_WAGES x rate/100, monthly cap)"),
    ("esi_deduction", "esi", "ESI", "deduction", "ESI_WAGES", "ESI_WAGES x employee rate/100"),
    ("professional_tax", "pt", "Professional Tax", "deduction", "GROSS_WAGES", "state slab table / statutory setting"),
    ("lwf_deduction", "lwf", "Labour Welfare Fund", "deduction", "WAGES", "state LWF rule"),
    ("tds_deduction", "tds", "Income Tax (TDS)", "deduction", "TAXABLE_SALARY", "tax slabs x regime, YTD-cumulative"),
    ("nps_deduction", "nps", "NPS (Employee)", "deduction", None, "retirement engine: wage basis x employee rate"),
    ("loan_deduction", "loan", "Loan Recovery", "deduction", None, "loan EMI amortization"),
    ("advance_deduction", "advance", "Salary Advance Recovery", "deduction", None, "advance recovery"),
    ("other_deductions", "other_deduction", "Other Deductions", "deduction", None, "other deductions"),
)

_EMPLOYER = (
    ("pf_employer_contribution", "pf_employer", "Employer PF", "employer_contribution", "PF_WAGES", "employer share"),
    ("pf_edli_contribution", "pf_edli", "EDLI", "employer_contribution", "PF_WAGES", "EDLI contribution"),
    ("pf_admin_contribution", "pf_admin", "PF Admin Charges", "employer_contribution", "PF_WAGES", "admin charges"),
    ("esi_employer_contribution", "esi_employer", "Employer ESI", "employer_contribution", "ESI_WAGES", "employer share"),
    ("lwf_employer_contribution", "lwf_employer", "Employer LWF", "employer_contribution", "WAGES", "state LWF rule"),
    ("gratuity", "gratuity", "Gratuity Accrual", "employer_contribution", "GRATUITY_WAGES", "15-day rule accrual"),
    ("nps_employer_contribution", "nps_employer", "NPS (Employer)", "employer_contribution", None, "retirement engine: wage basis x employer rate"),
)

# Which statutory rule_type explains each line code.
_RULE_TYPE_FOR = {
    "pf": "pf_contribution",
    "pf_employer": "pf_contribution",
    "pf_edli": "pf_contribution",
    "pf_admin": "pf_contribution",
    "esi": "esi_contribution",
    "esi_employer": "esi_contribution",
    "pt": "professional_tax",
    "lwf": "lwf",
    "lwf_employer": "lwf",
    "bonus": "bonus",
    "gratuity": "gratuity",
    "overtime": "overtime",
    "tds": "tax_slab",
    "nps": "nps",
    "nps_employer": "nps",
}


def _rule_provenance(db: Optional[Session], employee, rule_type: str,
                     as_of: date, state_code: Optional[str]) -> Dict[str, Any]:
    """Resolve rule provenance for a line (or document the settings fallback)."""
    if db is None or employee is None:
        return {"source": "fallback", "rule_id": None, "rule_version": None}
    try:
        from services.rule_platform import resolve_with_trace
        res = resolve_with_trace(
            db, rule_type, as_of, country="India", state_code=state_code,
            organization_id=employee.organization_id,
            company_id=getattr(employee, "company_id", None),
        )
        chosen = res.get("chosen")
        if chosen:
            return {
                "source": "rule",
                "rule_id": chosen["id"],
                "rule_version": chosen["version"],
                "effective_from": chosen.get("effective_from"),
                "notification_number": chosen.get("notification_number"),
            }
    except Exception:
        pass
    return {"source": "settings", "rule_id": None, "rule_version": None}


def build_explain_lines(
    result: Dict[str, Any],
    db: Optional[Session] = None,
    employee=None,
    as_of: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """Turn a calculate_payroll result into explainability lines."""
    as_of = as_of or date.today()
    state_code = result.get("registered_state") or getattr(
        getattr(employee, "organization", None), "registered_state", None
    )
    common_inputs = {
        "basic_salary": result.get("basic_salary"),
        "gross_salary": result.get("gross_salary"),
        "paid_days": result.get("paid_days"),
        "working_days": result.get("working_days"),
        "country": result.get("country"),
    }

    lines: List[Dict[str, Any]] = []
    seq = 0
    for catalog, side in ((_EARNINGS, "earning"), (_DEDUCTIONS, "deduction"), (_EMPLOYER, "employer_contribution")):
        for key, code, label, _side, basis, formula in catalog:
            amount = result.get(key)
            if amount is None:
                continue
            try:
                amount = round(float(amount), 2)
            except (TypeError, ValueError):
                continue
            if side != "employer_contribution" and amount == 0 and code in (
                "commission", "incentive", "arrears", "reimbursement",
                "other_earnings", "other_deduction", "loan", "advance",
            ):
                continue  # keep the explanation to what actually happened
            rule_type = _RULE_TYPE_FOR.get(code)
            prov = (_rule_provenance(db, employee, rule_type, as_of, state_code)
                    if rule_type else {"source": "component", "rule_id": None, "rule_version": None})
            line_inputs = dict(common_inputs)
            if code == "tds":
                line_inputs.update(result.get("tds_meta") or {})
            if basis:
                line_inputs["wage_basis"] = basis
            lines.append({
                "component_code": code,
                "label": label,
                "amount": amount,
                "side": _side,
                "sequence": seq,
                "source": prov["source"],
                "rule_id": prov.get("rule_id"),
                "rule_version": prov.get("rule_version"),
                "rule_type": rule_type,
                "formula": formula,
                "inputs": line_inputs,
                "wage_basis": basis,
                "effective_date": str(prov.get("effective_from") or as_of),
            })
            seq += 1
    return lines


def save_explain_lines(db: Session, payroll, lines: List[Dict[str, Any]]) -> None:
    """Persist explainability lines next to the payroll result."""
    from models import PayrollResultLine

    db.query(PayrollResultLine).filter(
        PayrollResultLine.payroll_id == payroll.id
    ).delete(synchronize_session=False)
    for line in lines:
        db.add(PayrollResultLine(
            payroll_id=payroll.id,
            organization_id=payroll.organization_id,
            component_code=line["component_code"],
            label=line["label"],
            amount=line["amount"],
            side=line["side"],
            sequence=line["sequence"],
            source=line["source"],
            rule_id=line["rule_id"],
            rule_version=line["rule_version"],
            rule_type=line["rule_type"],
            formula=line["formula"],
            inputs=line["inputs"],
            wage_basis=line["wage_basis"],
            effective_date=line["effective_date"],
        ))
    db.commit()


def explain_payload(db: Session, payroll) -> Dict[str, Any]:
    """The /explain response: payslip figures + their rules and formulas."""
    from models import PayrollResultLine

    rows = (
        db.query(PayrollResultLine)
        .filter(PayrollResultLine.payroll_id == payroll.id)
        .order_by(PayrollResultLine.side, PayrollResultLine.sequence)
        .all()
    )
    rules_used = {}
    lines = []
    for r in rows:
        if r.rule_id and r.rule_id not in rules_used:
            rules_used[r.rule_id] = {
                "id": r.rule_id, "version": r.rule_version,
                "ruleType": r.rule_type, "effectiveDate": r.effective_date,
            }
        lines.append({
            "componentCode": r.component_code,
            "label": r.label,
            "amount": r.amount,
            "side": r.side,
            "source": r.source,
            "ruleId": r.rule_id,
            "ruleVersion": r.rule_version,
            "ruleType": r.rule_type,
            "formula": r.formula,
            "inputs": r.inputs or {},
            "wageBasis": r.wage_basis,
            "effectiveDate": str(r.effective_date) if r.effective_date else None,
        })
    return {
        "payrollId": payroll.id,
        "employeeId": payroll.employee_id,
        "period": {"month": payroll.month, "year": payroll.year},
        "context": {
            "grossSalary": payroll.gross_salary,
            "totalDeductions": payroll.total_deductions,
            "netSalary": payroll.net_salary,
            "paidDays": payroll.paid_days,
            "workingDays": payroll.working_days,
        },
        "lines": lines,
        "rulesUsed": list(rules_used.values()),
    }
