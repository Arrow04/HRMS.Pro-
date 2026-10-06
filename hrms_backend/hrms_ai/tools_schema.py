"""Tool layer for the product-grade AI brain.

Every tool maps to REAL system capabilities — the same analyst methods and
action executor the rest of the app uses. The LLM (when configured) picks
tools; the keyword engine (when not) reaches the same destinations.
"""
from __future__ import annotations

import json
from typing import Any, Callable, Dict, List, Optional

# OpenAI-style function schemas the LLM sees
TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_employees",
            "description": "Find employees by name, code, email or designation. "
                           "Returns matching employee profiles.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Name, code or email fragment"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_payroll_summary",
            "description": "Payroll figures (gross, PF, ESI, PT, TDS, net) for an "
                           "employee or the whole organisation for a month.",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_name": {"type": "string", "description": "Employee name (omit for org totals)"},
                    "month": {"type": "integer", "minimum": 1, "maximum": 12},
                    "year": {"type": "integer"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_leave_balance",
            "description": "Remaining/total/used leave days per leave type for an employee.",
            "parameters": {
                "type": "object",
                "properties": {
                    "employee_name": {"type": "string"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_compliance_status",
            "description": "Statutory compliance status: overdue, due-soen filings with amounts.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_statutory_info",
            "description": "Configured statutory values (PF/ESI ceilings and rates, "
                           "gratuity ceiling and formula) for this organisation.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_org_overview",
            "description": "Headcount and company count for the organisation.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_payroll",
            "description": "Generate payroll payslips for a month (admin only). "
                           "Skips employees who already have a payslip. Does NOT "
                           "approve or pay — a different user must approve.",
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {"type": "integer", "minimum": 1, "maximum": 12},
                    "year": {"type": "integer"},
                    "employee_name": {"type": "string", "description": "Restrict to one employee"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "finalize_attendance",
            "description": "Finalize (cutoff) the attendance period for a month "
                           "(admin only). Blocks payroll regeneration until reopened.",
            "parameters": {
                "type": "object",
                "properties": {
                    "month": {"type": "integer", "minimum": 1, "maximum": 12},
                    "year": {"type": "integer"},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "init_leave_balances",
            "description": "Initialise missing leave balance rows for the year "
                           "(admin only). Idempotent.",
            "parameters": {
                "type": "object",
                "properties": {"year": {"type": "integer"}},
                "required": [],
            },
        },
    },
]


def build_tool_executor(analyst, context, db) -> Callable[[str, Dict[str, Any]], str]:
    """Returns execute(name, args) -> tool result text, bound to org context.

    Read tools go through the HRMSAnalyst (live DB). Operations go through
    AIActionExecutor (admin-only, audited) — never a parallel code path.
    """
    from hrms_ai.app_knowledge import describe_concept, describe_module, lookup_glossary, lookup_module

    def _resolve_employee_id(name: Optional[str]) -> Optional[int]:
        if not name:
            return getattr(context, "employee_id", None)
        from hrms_ai.analyst import _find_employee
        emp = _find_employee(db, getattr(context, "organization_id", None), name)
        return emp.id if emp else None

    def execute(name: str, args: Dict[str, Any]) -> str:
        args = args or {}
        try:
            if name == "search_employees":
                text = analyst._employee_answer(db, getattr(context, "organization_id", None),
                                                args.get("query", ""))
                return text or f"No employees found matching '{args.get('query', '')}'."
            if name == "get_payroll_summary":
                emp_name = args.get("employee_name") or ""
                month = args.get("month") or ""
                year = args.get("year") or ""
                q = emp_name
                if month:
                    q += f" {month}"
                if year:
                    q += f" {year}"
                q = q.strip() or "payroll summary"
                text = analyst._payroll_answer(
                    db, getattr(context, "organization_id", None),
                    getattr(context, "employee_id", None), q, getattr(context, "role", ""))
                return text or "No payroll data found."
            if name == "get_leave_balance":
                q = args.get("employee_name") or "my leave balance"
                text = analyst._leave_answer(
                    db, getattr(context, "organization_id", None),
                    getattr(context, "employee_id", None), q)
                return text or "No leave balance found."
            if name == "get_compliance_status":
                return analyst._compliance_answer(db, getattr(context, "organization_id", None)) \
                    or "Compliance status unavailable."
            if name == "get_statutory_info":
                return analyst._statutory_answer(db, getattr(context, "organization_id", None), "") \
                    or "Statutory configuration unavailable."
            if name == "get_org_overview":
                return analyst._org_answer(db, getattr(context, "organization_id", None)) \
                    or "Organisation overview unavailable."
            if name in ("run_payroll", "finalize_attendance", "init_leave_balances"):
                from hrms_ai.actions import AIActionExecutor
                params = dict(args)
                if name == "run_payroll" and args.get("employee_name"):
                    params["employee_id"] = _resolve_employee_id(args.get("employee_name"))
                executor = AIActionExecutor()
                result = executor.execute(action=name, parameters=params, context=context,
                                          db_session=db)
                return result.get("message") or json.dumps(result, default=str)
            if name in ("explain_concept", "what_is"):
                entry = lookup_glossary(args.get("topic", ""))
                return describe_concept(entry) if entry else "I don't have that concept documented."
            if name in ("find_in_app", "navigate"):
                mod = lookup_module(args.get("topic", ""))
                return describe_module(mod) if mod else "I couldn't find that in the app."
            return f"Unknown tool: {name}"
        except Exception as e:
            return f"Tool error ({name}): {e}"

    return execute
