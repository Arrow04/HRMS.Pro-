"""
Chatbot API Router - HR Assistant Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
from pydantic import BaseModel
from datetime import datetime
import re

from database_enterprise import get_db
from ai_engine import chatbot, ai_engine
from ai_service import AIAssistant, ChatContext

router = APIRouter(tags=["chatbot"])

_ai_assistant = None

def get_ai_assistant():
    global _ai_assistant
    if _ai_assistant is None:
        _ai_assistant = AIAssistant()
    return _ai_assistant

class ChatMessage(BaseModel):
    user_id: str
    message: str
    context: Optional[Dict[str, Any]] = {}

class ChatResponse(BaseModel):
    response: str
    intent: str
    suggestions: list
    timestamp: str


def _classify_intent(message: str) -> str:
    msg = message.lower()
    if any(w in msg for w in ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening']):
        return "greeting"
    if any(w in msg for w in ['find', 'search', 'lookup', 'employee', 'who is', 'tell me about']):
        return "employee_search"
    if any(w in msg for w in ['leave', 'vacation', 'holiday', 'time off', 'leave balance', 'leave type']):
        return "leave_query"
    if any(w in msg for w in ['salary', 'payroll', 'pay', 'wage', 'compensation', 'payslip', 'payslips']):
        return "payroll_query"
    if any(w in msg for w in ['attendance', 'present', 'absent', 'working days', 'check in', 'check out', 'clock in', 'clock out']):
        return "attendance_query"
    if any(w in msg for w in ['help', 'support', 'assist', 'what can you']):
        return "help"
    if any(w in msg for w in ['department', 'team', 'organization', 'company']):
        return "company_query"
    return "general"


def _get_employee_name_from_message(message: str) -> Optional[str]:
    msg = message.lower()
    for prefix in ['find employee ', 'search employee ', 'lookup employee ', 'find ', 'who is ', 'tell me about ']:
        if prefix in msg:
            name = msg.split(prefix, 1)[-1].strip()
            if name:
                return name
    return None


def _handle_employee_search(message: str, db: Session) -> str:
    from models import Employee
    name = _get_employee_name_from_message(message)
    if not name:
        return "Please specify a name. For example: \"Find employee John\" or \"Who is Sayak?\""
    like_pattern = f"%{name}%"
    employees = db.query(Employee).filter(
        (Employee.first_name.ilike(like_pattern)) |
        (Employee.last_name.ilike(like_pattern)) |
        (Employee.email.ilike(like_pattern))
    ).limit(5).all()
    if not employees:
        return f"No employees found matching \"{name}\"."
    lines = [f"Found {len(employees)} result(s) matching \"{name}\":"]
    for i, emp in enumerate(employees, 1):
        full_name = f"{emp.first_name or ''} {emp.last_name or ''}".strip()
        dept = getattr(emp, 'department', None) or getattr(emp, 'department_name', None) or 'N/A'
        designation = getattr(emp, 'designation', None) or 'N/A'
        lines.append(f"{i}. {full_name} — {dept}, {designation}")
    return "\n".join(lines)


def _handle_leave_query(message: str, user_id: str, db: Session) -> str:
    from models import LeaveBalance, LeaveType, LeaveApplication, Employee
    msg = message.lower()

    user = db.query(Employee).filter(
        (Employee.id == user_id) |
        (Employee.user_id == user_id) |
        (str(Employee.id) == str(user_id))
    ).first()

    if not user:
        return "Could not find your employee profile. Please contact HR."

    emp_id = user.id

    leave_balances = db.query(LeaveBalance).filter(LeaveBalance.employee_id == emp_id).all()
    leave_types = {lt.id: lt for lt in db.query(LeaveType).all()}

    if 'balance' in msg or 'remaining' in msg or 'how many' in msg or 'leave balance' in msg:
        if not leave_balances:
            return "No leave balances found for your account. Please contact HR."
        lines = [f"Leave Balance for {user.first_name or 'you'}:"]
        for lb in leave_balances:
            lt = leave_types.get(lb.leave_type_id)
            lt_name = lt.name if lt else "Unknown"
            remaining = lb.remaining or (lb.total - lb.used) if lb.total and lb.used else 0
            lines.append(f"• {lt_name}: {remaining} days remaining (Total: {lb.total or 0}, Used: {lb.used or 0})")
        return "\n".join(lines)

    if 'apply' in msg or 'apply for' in msg:
        return "To apply for leave, go to the Leave section in the app and tap 'Apply Leave'. You can select the leave type, dates, and add a reason."

    if 'pending' in msg or 'status' in msg or 'history' in msg:
        pending = db.query(LeaveApplication).filter(
            LeaveApplication.employee_id == emp_id,
            LeaveApplication.status.in_(['pending', 'approved', 'rejected'])
        ).order_by(LeaveApplication.created_at.desc()).limit(5).all()
        if not pending:
            return "No leave applications found."
        lines = [f"Recent leave applications for {user.first_name or 'you'}:"]
        for la in pending:
            lt = leave_types.get(la.leave_type_id)
            lt_name = lt.name if lt else "Unknown"
            lines.append(f"• {lt_name} ({la.start_date} to {la.end_date}) — Status: {la.status}")
        return "\n".join(lines)

    if 'policy' in msg:
        return ("Leave Policy:\n"
                "• Annual Leave: 15 days/year\n"
                "• Sick Leave: 7 days/year\n"
                "• Casual Leave: 7 days/year\n"
                "• Maternity/Paternity: As per policy\n"
                "• Leave year resets on Jan 1st.\n"
                "Please check the Policies section for full details.")

    return "I can help with leave balance, applying for leave, leave status, or leave policy. What would you like to know?"


def _handle_payroll_query(message: str, user_id: str, db: Session) -> str:
    from models import Payroll, Employee
    msg = message.lower()

    user = db.query(Employee).filter(
        (Employee.id == user_id) |
        (Employee.user_id == user_id) |
        (str(Employee.id) == str(user_id))
    ).first()

    if not user:
        return "Could not find your employee profile. Please contact HR."

    emp_id = user.id

    payslips = db.query(Payroll).filter(Payroll.employee_id == emp_id).order_by(Payroll.created_at.desc()).limit(3).all()

    if 'payslip' in msg or 'slip' in msg or 'download' in msg:
        if not payslips:
            return "No payslips found for your account."
        lines = ["Your recent payslips:"]
        for p in payslips:
            net = p.net_pay or p.net_payable or p.take_home or 0
            status = p.status or 'pending'
            lines.append(f"• {p.pay_period or p.period or 'N/A'} — ₹{net:,.0f} ({status})")
        lines.append("\nGo to Profile > Payslips to download PDFs.")
        return "\n".join(lines)

    if 'summary' in msg or 'show payroll' in msg or 'salary' in msg or 'pay' in msg:
        if not payslips:
            return "No payroll records found for your account."
        p = payslips[0]
        base = p.basic_salary or p.base_salary or 0
        gross = p.gross_salary or p.gross_pay or 0
        net = p.net_pay or p.net_payable or p.take_home or 0
        deductions = p.total_deductions or p.deductions or (gross - net) if gross and net else 0
        lines = [
            f"Payroll Summary ({p.pay_period or p.period or 'Latest'}):",
            f"• Basic Salary: ₹{base:,.0f}",
            f"• Gross Salary: ₹{gross:,.0f}",
            f"• Deductions: ₹{deductions:,.0f}",
            f"• Net Pay: ₹{net:,.0f}",
        ]
        return "\n".join(lines)

    return "I can help with payslip details, salary summary, or payroll history. What would you like to know?"


def _handle_attendance_query(message: str, user_id: str, db: Session) -> str:
    from models import Attendance, Employee
    from datetime import datetime, timedelta
    msg = message.lower()

    user = db.query(Employee).filter(
        (Employee.id == user_id) |
        (Employee.user_id == user_id) |
        (str(Employee.id) == str(user_id))
    ).first()

    if not user:
        return "Could not find your employee profile. Please contact HR."

    emp_id = user.id
    now = datetime.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    week_start = now - timedelta(days=now.weekday())

    records = db.query(Attendance).filter(
        Attendance.employee_id == emp_id,
        Attendance.date >= month_start.date()
    ).order_by(Attendance.date.desc()).limit(30).all()

    total_days = len(records)
    present_days = sum(1 for r in records if r.status == 'present' or (r.check_in and not r.status == 'absent'))
    late_days = sum(1 for r in records if r.status == 'late' or getattr(r, 'late_arrival', False))
    absent_days = sum(1 for r in records if r.status == 'absent')
    total_hours = sum(getattr(r, 'work_hours', 0) or 0 for r in records)

    attendance_pct = (present_days / total_days * 100) if total_days > 0 else 0

    lines = [
        f"Attendance Summary ({now.strftime('%B %Y')}) for {user.first_name or 'you'}:",
        f"• Total Working Days: {total_days}",
        f"• Present: {present_days} ({attendance_pct:.0f}%)",
        f"• Late: {late_days}",
        f"• Absent: {absent_days}",
        f"• Total Hours: {total_hours:.1f}h",
    ]

    today_rec = next((r for r in records if r.date == now.date()), None)
    if today_rec:
        ci = getattr(today_rec, 'check_in', None)
        co = getattr(today_rec, 'check_out', None)
        lines.append(f"\nToday: Check-in {ci.strftime('%I:%M %p') if ci else 'N/A'} | Check-out {co.strftime('%I:%M %p') if co else 'Not yet'}")
    else:
        lines.append(f"\nNo attendance record for today yet.")

    return "\n".join(lines)


def _handle_company_query(message: str, db: Session) -> str:
    from models import Employee
    msg = message.lower()
    total = db.query(Employee).count()
    active = db.query(Employee).filter(Employee.status == 'active').count()
    lines = [
        f"Company Overview:",
        f"• Total Employees: {total}",
        f"• Active: {active}",
    ]
    return "\n".join(lines)


def _get_suggestions(intent: str) -> list:
    suggestions = {
        "greeting": ["Find employee", "My leave balance", "Payslip info"],
        "employee_search": ["View details", "Department report"],
        "leave_query": ["Apply leave", "Leave balance", "Leave status"],
        "payroll_query": ["Download payslip", "Salary summary"],
        "attendance_query": ["Mark attendance", "Monthly summary"],
        "company_query": ["Team size", "Departments"],
        "help": ["Leave balance", "Find employee", "Payslip"],
    }
    return suggestions.get(intent, ["Help", "Contact HR"])


def _smart_fallback_response(message: str, user_id: str, db: Session) -> str:
    msg = message.lower()
    intent = _classify_intent(message)

    if intent == "greeting":
        return "Hello! I'm your HR assistant. I can help with employee search, leave balance, payroll info, attendance, and more. What would you like to know?"

    if intent == "employee_search":
        return _handle_employee_search(message, db)

    if intent == "leave_query":
        return _handle_leave_query(message, user_id, db)

    if intent == "payroll_query":
        return _handle_payroll_query(message, user_id, db)

    if intent == "attendance_query":
        return _handle_attendance_query(message, user_id, db)

    if intent == "company_query":
        return _handle_company_query(message, db)

    if intent == "help":
        return ("Available commands:\n"
                "• \"Find employee [name]\" — Search for an employee\n"
                "• \"Leave balance\" — Check your leave balance\n"
                "• \"Apply leave\" — Apply for leave\n"
                "• \"Payslip\" — View payslips\n"
                "• \"Salary\" — Salary summary\n"
                "• \"Attendance\" — Monthly attendance\n"
                "• \"Department\" — Company overview")

    return (f"I can help with:\n"
            "• Employee search: \"Find employee [name]\"\n"
            "• Leave: \"Leave balance\", \"Apply leave\"\n"
            "• Payroll: \"Payslip\", \"Salary\"\n"
            "• Attendance: \"Attendance this month\"\n"
            "• Type \"Help\" for full commands")


@router.post("/message", response_model=ChatResponse)
def send_message(chat_msg: ChatMessage, db: Session = Depends(get_db)):
    """
    Send message to HR chatbot and get response.
    Uses DB-backed intelligence first, falls back to AI for unknown queries.
    """
    try:
        from datetime import datetime

        intent = _classify_intent(chat_msg.message)

        # DB-backed for known intents
        if intent != "general":
            response = _smart_fallback_response(chat_msg.message, chat_msg.user_id, db)
            chatbot.conversation_history.setdefault(chat_msg.user_id, []).append({
                "timestamp": datetime.now().isoformat(),
                "user": chat_msg.message,
                "bot": response
            })
            return ChatResponse(
                response=response,
                intent=intent,
                suggestions=_get_suggestions(intent),
                timestamp=datetime.now().isoformat()
            )

        # Try AI for general/unknown queries
        try:
            assistant = get_ai_assistant()
            chat_ctx = ChatContext(
                user_id=chat_msg.user_id,
                conversation_history=[]
            )
            result = asyncio.get_event_loop().run_until_complete(
                assistant.chat(chat_msg.message, chat_ctx)
            )
            return ChatResponse(
                response=result["response"],
                intent=result.get("intent", "general"),
                suggestions=result.get("suggestions", []),
                timestamp=result.get("timestamp", datetime.now().isoformat())
            )
        except Exception as ai_error:
            print(f"AI unavailable, using fallback: {ai_error}")
            response = _smart_fallback_response(chat_msg.message, chat_msg.user_id, db)
            chatbot.conversation_history.setdefault(chat_msg.user_id, []).append({
                "timestamp": datetime.now().isoformat(),
                "user": chat_msg.message,
                "bot": response
            })
            return ChatResponse(
                response=response,
                intent="general",
                suggestions=_get_suggestions("general"),
                timestamp=datetime.now().isoformat()
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chatbot error: {str(e)}")


@router.get("/history/{user_id}")
def get_chat_history(user_id: str):
    """Get chat history for a user"""
    history = chatbot.conversation_history.get(user_id, [])
    return {
        "user_id": user_id,
        "messages": history[-50:],
        "total_messages": len(history)
    }


@router.delete("/history/{user_id}")
def clear_chat_history(user_id: str):
    """Clear chat history for a user"""
    if user_id in chatbot.conversation_history:
        chatbot.conversation_history[user_id] = []
    return {"message": "Chat history cleared"}


@router.get("/suggestions")
def get_quick_suggestions():
    """Get quick suggestion buttons for chatbot UI"""
    return {
        "suggestions": [
            {"icon": "👤", "label": "Find Employee", "query": "Find employee "},
            {"icon": "🏖️", "label": "Leave Balance", "query": "What's my leave balance?"},
            {"icon": "💰", "label": "Payroll", "query": "Show payroll summary"},
            {"icon": "📊", "label": "Attendance", "query": "Attendance this month"},
            {"icon": "📋", "label": "Help", "query": "Help"},
        ]
    }


@router.post("/ai-report")
def generate_ai_report(
    report_type: str,
    parameters: Optional[Dict[str, Any]] = None,
    db: Session = Depends(get_db)
):
    """Generate AI-powered insights report"""
    parameters = parameters or {}

    if report_type == "attrition":
        sample_data = {
            "leaves_taken": 15,
            "performance_score": 75,
            "years_in_role": 2
        }
        return ai_engine.predict_attrition_risk(sample_data)

    elif report_type == "payroll":
        sample_payroll = [
            {"amount": 50000, "department": "Engineering", "employee_id": 1},
            {"amount": 45000, "department": "HR", "employee_id": 2},
        ]
        return ai_engine.generate_payroll_insights(sample_payroll)

    else:
        return {"message": "Report type not supported yet"}


@router.get("/health")
def chatbot_health():
    """Health check for chatbot service"""
    return {
        "status": "online",
        "active_conversations": len(chatbot.conversation_history),
        "total_messages": sum(len(h) for h in chatbot.conversation_history.values()),
        "version": "2.0.0"
    }
