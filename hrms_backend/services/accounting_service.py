"""Accounting / GL service.

Posts double-entry journals for payroll payments and Full & Final settlement.
Uses a per-organization chart of accounts (seeded lazily with Indian-standard
defaults). Journals are non-destructive: reversing a payment posts a mirror
entry instead of mutating the original (audit-friendly).
"""
from __future__ import annotations

import logging
from datetime import datetime, date
from typing import Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import GLAccount, JournalEntry, JournalLine, Organization

logger = logging.getLogger(__name__)


# ── Chart of accounts seeding ──

_DEFAULT_ACCOUNTS = [
    # Assets
    ("1001", "Bank Account", "asset", True),
    ("1002", "Petty Cash", "asset", True),
    ("1003", "Employee Advances", "asset", True),
    ("1004", "Salary Loans Outstanding", "asset", True),
    # Liabilities
    ("2001", "Salaries Payable", "liability", True),
    ("2002", "Employee PF Payable", "liability", True),
    ("2003", "Employee ESI Payable", "liability", True),
    ("2004", "Professional Tax Payable", "liability", True),
    ("2005", "TDS Payable", "liability", True),
    ("2006", "LWF Payable", "liability", True),
    ("2007", "Gratuity Payable", "liability", True),
    ("2008", "F&F Settlement Payable", "liability", True),
    # Expenses
    ("5001", "Salary Expense", "expense", True),
    ("5002", "Employer PF Contribution", "expense", True),
    ("5003", "Employer ESI Contribution", "expense", True),
    ("5004", "Gratuity Expense", "expense", True),
    ("5005", "Employer LWF Contribution", "expense", True),
    ("5006", "Leave Encashment Expense", "expense", True),
    ("5007", "Expense Reimbursement", "expense", True),
]


def ensure_chart_of_accounts(db: Session, organization_id: Optional[int],
                             company_id: Optional[int] = None) -> None:
    """Create default GL accounts for an organization if they don't exist yet."""
    if not organization_id:
        return
    existing_codes = {a.code for a in db.query(GLAccount).filter(
        GLAccount.organization_id == organization_id,
        GLAccount.deleted_at.is_(None),
    ).all()}
    for code, name, acc_type, is_system in _DEFAULT_ACCOUNTS:
        if code in existing_codes:
            continue
        db.add(GLAccount(
            organization_id=organization_id,
            company_id=company_id,
            code=code,
            name=name,
            account_type=acc_type,
            is_system=is_system,
        ))
    db.flush()


def _account_code(db: Session, organization_id: int, code: str) -> Optional[int]:
    acc = db.query(GLAccount).filter(
        GLAccount.organization_id == organization_id,
        GLAccount.code == code,
        GLAccount.deleted_at.is_(None),
    ).first()
    return acc.id if acc else None


def _org_of(db: Session, organization_id: int) -> int:
    return organization_id or 0


def _post_journal(
    db: Session,
    organization_id: int,
    company_id: Optional[int],
    entry_type: str,
    reference_type: str,
    reference_id: Optional[int],
    reference_no: Optional[str],
    description: str,
    lines: List[dict],
    created_by: Optional[int] = None,
) -> Optional[JournalEntry]:
    """lines: list of {account_code, debit, credit, narration}."""
    if not organization_id:
        return None
    ensure_chart_of_accounts(db, organization_id, company_id)
    resolved = []
    for ln in lines:
        acc_id = _account_code(db, organization_id, ln["account_code"])
        if not acc_id:
            logger.warning("GL account %s missing for org %s; skipping journal", ln["account_code"], organization_id)
            return None
        resolved.append({
            "account_id": acc_id,
            "debit": round(ln.get("debit", 0) or 0, 2),
            "credit": round(ln.get("credit", 0) or 0, 2),
            "narration": ln.get("narration", ""),
            "cost_center": ln.get("cost_center"),
        })
    total_debit = round(sum(l["debit"] for l in resolved), 2)
    total_credit = round(sum(l["credit"] for l in resolved), 2)
    if abs(total_debit - total_credit) > 0.01:
        logger.error("Unbalanced journal (%s): debit %s credit %s", entry_type, total_debit, total_credit)
        return None
    entry = JournalEntry(
        organization_id=organization_id,
        company_id=company_id,
        entry_date=date.today(),
        entry_type=entry_type,
        reference_type=reference_type,
        reference_id=reference_id,
        reference_no=reference_no,
        description=description,
        status="posted",
        created_by=created_by,
    )
    db.add(entry)
    db.flush()
    for ln in resolved:
        db.add(JournalLine(journal_entry_id=entry.id, **ln))
    db.commit()
    db.refresh(entry)
    return entry


def reverse_journal(db: Session, entry_id: int, reversed_by: Optional[int] = None, organization_id: Optional[int] = None) -> Optional[JournalEntry]:
    """Reverse a posted journal by posting mirror lines (non-destructive)."""
    q = db.query(JournalEntry).filter(JournalEntry.id == entry_id)
    if organization_id:
        q = q.filter(JournalEntry.organization_id == organization_id)
    entry = q.first()
    if not entry or entry.status != "posted":
        raise HTTPException(status_code=404, detail="Journal not found or already reversed")
    lines = []
    for ln in entry.lines:
        lines.append({
            "account_code": ln.account.code,
            "debit": ln.credit,
            "credit": ln.debit,
            "narration": f"Reversal of {entry.description}",
        })
    rev = _post_journal(
        db, entry.organization_id, entry.company_id,
        entry.entry_type, entry.reference_type, entry.reference_id,
        entry.reference_no, f"REVERSAL: {entry.description}", lines,
        created_by=reversed_by,
    )
    if rev:
        entry.status = "reversed"
        entry.reversed_at = datetime.utcnow()
        entry.reversed_by = reversed_by
        db.commit()
        db.refresh(entry)
    return rev


def post_payroll_journal(db: Session, pr, current_user) -> Optional[JournalEntry]:
    """Post the salary accrual + payment journal for a paid payroll.

    Debits salary + employer statutory expenses; credits net-pay to Bank and
    the statutory/loan liability accounts. Fully double-entry.
    """
    org_id = pr.organization_id
    if not org_id:
        return None
    ensure_chart_of_accounts(db, org_id, pr.company_id)
    emp_name = f"{pr.employee.first_name} {pr.employee.last_name or ''}".strip() if pr.employee else f"Employee #{pr.employee_id}"
    period = f"{pr.month:02d}/{pr.year}"
    description = f"Payroll {period} - {emp_name}"

    total_earnings = float(pr.total_earnings or 0)
    net = float(pr.net_salary or 0)
    # A zero-pay payroll (e.g. no attendance) has nothing to book; skip it so a
    # degenerate record (deductions on 0 earnings) never produces an unbalanced entry.
    if total_earnings <= 0 and net <= 0:
        return None

    pf_emp = float(pr.pf_deduction or 0)
    esi_emp = float(pr.esi_deduction or 0)
    pt = float(pr.professional_tax or 0)
    tds = float(pr.tds_deduction or 0)
    lwf_emp = float(pr.lwf_deduction or 0)
    loan = float(pr.loan_deduction or 0)
    advance = float(pr.advance_deduction or 0)
    pf_er = float(pr.pf_employer_contribution or 0) + float(getattr(pr, "pf_edli_contribution", 0) or 0) + float(getattr(pr, "pf_admin_contribution", 0) or 0)
    esi_er = float(pr.esi_employer_contribution or 0)
    lwf_er = float(pr.lwf_employer_contribution or 0)
    gratuity = float(pr.gratuity or 0)

    lines = [
        {"account_code": "5001", "debit": total_earnings, "credit": 0, "narration": "Gross salary"},
    ]
    if pf_er:
        lines.append({"account_code": "5002", "debit": pf_er, "credit": 0, "narration": "Employer PF"})
    if esi_er:
        lines.append({"account_code": "5003", "debit": esi_er, "credit": 0, "narration": "Employer ESI"})
    if gratuity:
        lines.append({"account_code": "5004", "debit": gratuity, "credit": 0, "narration": "Gratuity provision"})
    if lwf_er:
        lines.append({"account_code": "5005", "debit": lwf_er, "credit": 0, "narration": "Employer LWF"})
    # Credits: net salary via bank + statutory/loan liabilities.
    # Employer portions are credited to their own payables (double-entry).
    if net:
        lines.append({"account_code": "1001", "debit": 0, "credit": net, "narration": "Net salary via bank"})
    if pf_emp or pf_er:
        lines.append({"account_code": "2002", "debit": 0, "credit": pf_emp + pf_er, "narration": "Employee + employer PF"})
    if esi_emp or esi_er:
        lines.append({"account_code": "2003", "debit": 0, "credit": esi_emp + esi_er, "narration": "Employee + employer ESI"})
    if pt:
        lines.append({"account_code": "2004", "debit": 0, "credit": pt, "narration": "Professional tax"})
    if tds:
        lines.append({"account_code": "2005", "debit": 0, "credit": tds, "narration": "TDS"})
    if lwf_emp or lwf_er:
        lines.append({"account_code": "2006", "debit": 0, "credit": lwf_emp + lwf_er, "narration": "Employee + employer LWF"})
    if gratuity:
        lines.append({"account_code": "2007", "debit": 0, "credit": gratuity, "narration": "Gratuity payable"})
    if loan:
        lines.append({"account_code": "1004", "debit": 0, "credit": loan, "narration": "Salary loan recovery"})
    if advance:
        lines.append({"account_code": "1003", "debit": 0, "credit": advance, "narration": "Advance recovery"})
    other_ded = float(pr.other_deductions or 0)
    if other_ded:
        lines.append({"account_code": "2001", "debit": 0, "credit": other_ded, "narration": "Other deductions (payable)"})

    # GL tagging: every line carries the employee's cost centre so P&L and
    # departmental reporting never need a second mapping pass.
    _cc = getattr(pr.employee, "cost_center", None) if pr.employee else None
    if _cc:
        for ln in lines:
            ln["cost_center"] = _cc

    return _post_journal(
        db, org_id, pr.company_id, "payroll", "payroll", pr.id, f"PAY-{pr.id}",
        description, lines, created_by=current_user.id if current_user else None,
    )


def post_fnf_journal(db: Session, exit_record, fnf_details: dict, current_user=None) -> Optional[JournalEntry]:
    """Post the Full & Final settlement journal.

    Debits salary/gratuity/encashment/expense-reimbursement expenses; credits
    the F&F payable, then nets against outstanding loans (as receivable
    reduction). Net payable is paid via bank.
    """
    org_id = getattr(exit_record, "organization_id", None)
    if not org_id:
        return None
    ensure_chart_of_accounts(db, org_id, getattr(exit_record, "company_id", None))
    emp_name = getattr(exit_record.employee, "full_name", None) or f"Employee #{exit_record.employee_id}"
    description = f"F&F Settlement - {emp_name} (Exit {exit_record.id})"

    salary = float((fnf_details or {}).get("salary_until_last_working_day", 0) or 0)
    gratuity = float((fnf_details or {}).get("gratuity_amount", 0) or 0)
    encashment = float((fnf_details or {}).get("leave_encashment", 0) or 0)
    expense_reimb = float((fnf_details or {}).get("expense_reimbursement", 0) or 0)
    notice_recovery = float((fnf_details or {}).get("notice_period_recovery", 0) or 0)
    loan_recovery = float((fnf_details or {}).get("outstanding_loan_recovery", 0) or 0)
    other_recovery = float((fnf_details or {}).get("other_recoveries", 0) or 0)

    total_credits = notice_recovery + loan_recovery + other_recovery
    net_payable = max(0.0, salary + gratuity + encashment + expense_reimb - total_credits)

    lines = []
    if salary:
        lines.append({"account_code": "5001", "debit": salary, "credit": 0, "narration": "Salary till last working day"})
    if gratuity:
        lines.append({"account_code": "5004", "debit": gratuity, "credit": 0, "narration": "Gratuity"})
    if encashment:
        lines.append({"account_code": "5006", "debit": encashment, "credit": 0, "narration": "Leave encashment"})
    if expense_reimb:
        lines.append({"account_code": "5007", "debit": expense_reimb, "credit": 0, "narration": "Expense reimbursement"})
    if notice_recovery:
        lines.append({"account_code": "2001", "debit": 0, "credit": notice_recovery, "narration": "Notice period recovery"})
    if loan_recovery:
        lines.append({"account_code": "1004", "debit": 0, "credit": loan_recovery, "narration": "Outstanding loan recovery"})
    if other_recovery:
        lines.append({"account_code": "2001", "debit": 0, "credit": other_recovery, "narration": "Other recovery"})
    if net_payable:
        lines.append({"account_code": "1001", "debit": 0, "credit": net_payable, "narration": "Net F&F paid via bank"})

    return _post_journal(
        db, org_id, getattr(exit_record, "company_id", None), "fnf", "exit_record",
        exit_record.id, f"FNF-{exit_record.id}", description, lines,
        created_by=current_user.id if current_user else None,
    )


def list_journals(db: Session, organization_id: Optional[int],
                  entry_type: Optional[str] = None,
                  reference_type: Optional[str] = None,
                  reference_id: Optional[int] = None,
                  limit: int = 200,
                  company_id: Optional[int] = None) -> List[dict]:
    if not organization_id:
        return []
    q = db.query(JournalEntry).filter(JournalEntry.organization_id == organization_id)
    if company_id is not None:
        q = q.filter(JournalEntry.company_id == company_id)
    if entry_type:
        q = q.filter(JournalEntry.entry_type == entry_type)
    if reference_type:
        q = q.filter(JournalEntry.reference_type == reference_type)
    if reference_id:
        q = q.filter(JournalEntry.reference_id == reference_id)
    q = q.order_by(JournalEntry.created_at.desc()).limit(limit)
    out = []
    for e in q.all():
        lines = [{
            "id": ln.id,
            "account_id": ln.account_id,
            "account_code": ln.account.code if ln.account else None,
            "account_name": ln.account.name if ln.account else None,
            "debit": ln.debit,
            "credit": ln.credit,
            "narration": ln.narration,
        } for ln in e.lines]
        out.append({
            "id": e.id,
            "organization_id": e.organization_id,
            "company_id": e.company_id,
            "entry_date": e.entry_date.isoformat() if e.entry_date else None,
            "entry_type": e.entry_type,
            "reference_type": e.reference_type,
            "reference_id": e.reference_id,
            "reference_no": e.reference_no,
            "description": e.description,
            "status": e.status,
            "created_at": e.created_at.isoformat() if e.created_at else None,
            "lines": lines,
            "total_debit": round(sum(l["debit"] for l in lines), 2),
            "total_credit": round(sum(l["credit"] for l in lines), 2),
        })
    return out


def list_accounts(db: Session, organization_id: Optional[int],
                  company_id: Optional[int] = None) -> List[dict]:
    if not organization_id:
        return []
    q = db.query(GLAccount).filter(
        GLAccount.deleted_at.is_(None),
        GLAccount.organization_id == organization_id,
    )
    if company_id is not None:
        q = q.filter(GLAccount.company_id == company_id)
    q = q.order_by(GLAccount.code)
    return [{
        "id": a.id,
        "organization_id": a.organization_id,
        "code": a.code,
        "name": a.name,
        "account_type": a.account_type,
        "is_system": bool(a.is_system),
        "is_active": bool(a.is_active),
    } for a in q.all()]