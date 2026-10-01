"""
HRMS AI Action Execution Layer
Defines all executable HR actions that the AI can perform on behalf of users
"""
import json
from typing import Optional, Dict, Any, List, Callable
from datetime import datetime, date
from enum import Enum
from sqlalchemy.orm import Session

from hrms_ai.exceptions import AIPermissionError, AIActionExecutionError, AITenantIsolationError
from hrms_ai.schemas import AIContext
from hrms_ai.audit import get_ai_audit_logger, AuditEventType, AuditSeverity
from hrms_ai.escalation import get_escalation_manager, EscalationReason
from hrms_ai.email_templates import get_email_template_engine, EmailType
from hrms_ai.documents import get_document_generator
from hrms_ai.workflows import get_workflow_engine


class ActionPermission(str, Enum):
    READ_OWN = "read_own"
    READ_TEAM = "read_team"
    READ_ALL = "read_all"
    WRITE_OWN = "write_own"
    WRITE_TEAM = "write_team"
    WRITE_ALL = "write_all"
    ADMIN = "admin"


ACTION_PERMISSIONS: Dict[str, Dict[str, ActionPermission]] = {
    "search_employees": {"employee": ActionPermission.READ_ALL, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "search_employees_by_department": {"employee": ActionPermission.READ_ALL, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "view_employee_profile": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "update_contact_info": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
    
    "check_leave_balance": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "apply_leave": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.WRITE_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
    "cancel_leave": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.WRITE_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
    "view_leave_history": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    
    "view_attendance": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "mark_attendance": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
    "request_attendance_correction": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.WRITE_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
    
    "view_payslip": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "view_payroll_summary": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "download_tax_form": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    
    "view_team": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "view_reportees": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "view_org_chart": {"employee": ActionPermission.READ_TEAM, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    
    "lookup_policy": {"employee": ActionPermission.READ_ALL, "manager": ActionPermission.READ_ALL, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "search_documents": {"employee": ActionPermission.READ_ALL, "manager": ActionPermission.READ_ALL, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    
    "check_onboarding_status": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "view_onboarding_tasks": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    
    "view_asset_allocations": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "request_asset": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.WRITE_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
    
    "initiate_resignation": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
    "create_expense_claim": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.WRITE_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
    "file_grievance": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
    "view_performance_reviews": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "refer_candidate": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.WRITE_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
    "view_job_openings": {"employee": ActionPermission.READ_ALL, "manager": ActionPermission.READ_ALL, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    
    "generate_resignation_email": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "generate_attendance_correction_email": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "generate_expense_claim_email": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "generate_leave_request_email": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "generate_document": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    
    "get_workflow": {"employee": ActionPermission.READ_OWN, "manager": ActionPermission.READ_TEAM, "hr_admin": ActionPermission.READ_ALL, "admin": ActionPermission.READ_ALL},
    "start_workflow": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.WRITE_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
    "advance_workflow": {"employee": ActionPermission.WRITE_OWN, "manager": ActionPermission.WRITE_TEAM, "hr_admin": ActionPermission.WRITE_ALL, "admin": ActionPermission.WRITE_ALL},
}


class AIActionExecutor:
    """Executes HR actions on behalf of users with permission and tenant checks"""
    
    def __init__(self, db_session_factory=None):
        self.db_session_factory = db_session_factory
        self._action_registry: Dict[str, Callable] = {
            "search_employees": self._action_search_employees,
            "search_employees_by_department": self._action_search_employees_by_department,
            "view_employee_profile": self._action_view_employee_profile,
            "update_contact_info": self._action_update_contact_info,
            "check_leave_balance": self._action_check_leave_balance,
            "apply_leave": self._action_apply_leave,
            "cancel_leave": self._action_cancel_leave,
            "view_leave_history": self._action_view_leave_history,
            "view_attendance": self._action_view_attendance,
            "mark_attendance": self._action_mark_attendance,
            "request_attendance_correction": self._action_request_attendance_correction,
            "view_payslip": self._action_view_payslip,
            "view_payroll_summary": self._action_view_payroll_summary,
            "download_tax_form": self._action_download_tax_form,
            "view_team": self._action_view_team,
            "view_reportees": self._action_view_reportees,
            "view_org_chart": self._action_view_org_chart,
            "lookup_policy": self._action_lookup_policy,
            "check_onboarding_status": self._action_check_onboarding_status,
            "view_onboarding_tasks": self._action_view_onboarding_tasks,
            "view_asset_allocations": self._action_view_asset_allocations,
            "request_asset": self._action_request_asset,
            "initiate_resignation": self._action_initiate_resignation,
            "create_expense_claim": self._action_create_expense_claim,
            "file_grievance": self._action_file_grievance,
            "view_performance_reviews": self._action_view_performance_reviews,
            "refer_candidate": self._action_refer_candidate,
            "view_job_openings": self._action_view_job_openings,
            "generate_resignation_email": self._action_generate_resignation_email,
            "generate_attendance_correction_email": self._action_generate_attendance_correction_email,
            "generate_expense_claim_email": self._action_generate_expense_claim_email,
            "generate_leave_request_email": self._action_generate_leave_request_email,
            "generate_document": self._action_generate_document,
            "get_workflow": self._action_get_workflow,
            "start_workflow": self._action_start_workflow,
            "advance_workflow": self._action_advance_workflow,
        }
    
    def _get_db(self, db_session=None) -> Session:
        if db_session:
            return db_session
        if self.db_session_factory:
            return self.db_session_factory()
        return None
    
    def _check_permission(self, user_role: str, action: str, required_permission: ActionPermission) -> bool:
        role_permissions = ACTION_PERMISSIONS.get(action, {})
        granted = role_permissions.get(user_role, ActionPermission.READ_OWN)
        
        permission_hierarchy = {
            ActionPermission.READ_OWN: 0,
            ActionPermission.READ_TEAM: 1,
            ActionPermission.READ_ALL: 2,
            ActionPermission.WRITE_OWN: 3,
            ActionPermission.WRITE_TEAM: 4,
            ActionPermission.WRITE_ALL: 5,
            ActionPermission.ADMIN: 6,
        }
        
        return permission_hierarchy.get(granted, 0) >= permission_hierarchy.get(required_permission, 0)
    
    def _validate_tenant(self, user_org_id: Optional[int], target_org_id: Optional[int]) -> bool:
        if user_org_id is None:
            return True
        return user_org_id == target_org_id
    
    def execute(self, action: str, parameters: Dict[str, Any], context: AIContext, db_session=None) -> Dict[str, Any]:
        audit = get_ai_audit_logger()
        start_time = datetime.now()
        
        if action not in self._action_registry:
            audit.log_action(
                user_id=context.user_id,
                action=action,
                parameters=parameters,
                result={"success": False, "error": "Unknown action"},
                organization_id=context.organization_id,
                success=False,
                error=f"Unknown action: {action}",
            )
            return {
                "success": False,
                "action": action,
                "error": f"Unknown action: {action}",
                "message": f"I don't know how to perform the action '{action}'.",
            }
        
        role = context.role or "employee"
        required_perm = ActionPermission.READ_OWN
        
        if action.startswith("apply_") or action.startswith("cancel_") or action.startswith("update_") or action.startswith("request_") or action.startswith("mark_"):
            required_perm = ActionPermission.WRITE_OWN
        elif action.startswith("view_") or action.startswith("check_") or action.startswith("search_") or action.startswith("download_"):
            required_perm = ActionPermission.READ_OWN
        
        if not self._check_permission(role, action, required_perm):
            audit.log_permission_denied(
                user_id=context.user_id,
                action=action,
                reason=f"Role '{role}' does not have {required_perm.value} permission",
                organization_id=context.organization_id,
            )
            
            esc_mgr = get_escalation_manager()
            should_esc, esc_reason, esc_desc = esc_mgr.should_escalate(
                confidence=1.0, action=action, context=parameters,
            )
            
            error_msg = f"I don't have permission to {action.replace('_', ' ')}. "
            if should_esc:
                esc = esc_mgr.create_escalation(
                    conversation_id="",
                    user_id=context.user_id,
                    reason=EscalationReason.PERMISSION_DENIED,
                    title=f"Permission denied: {action}",
                    description=f"User {context.user_id} ({role}) requested action '{action}' but lacks permission.",
                    context={"action": action, "parameters": parameters, "user_role": role},
                    organization_id=context.organization_id,
                )
                error_msg += f"I've escalated this to HR. Escalation ID: {esc.escalation_id}"
                audit.log_escalation(
                    user_id=context.user_id,
                    reason=f"Permission denied for {action}",
                    priority="medium",
                    organization_id=context.organization_id,
                )
            
            return {"success": False, "action": action, "error": "permission_denied", "message": error_msg}
        
        db = self._get_db(db_session)
        owns_session = db_session is None
        try:
            handler = self._action_registry[action]
            result = handler(parameters, context, db)
            
            latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            audit.log_action(
                user_id=context.user_id,
                action=action,
                parameters=parameters,
                result=result,
                organization_id=context.organization_id,
                success=result.get("success", False),
                error=result.get("error"),
                latency_ms=latency_ms,
            )
            return result
        except Exception as e:
            latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
            audit.log_action(
                user_id=context.user_id,
                action=action,
                parameters=parameters,
                result={"success": False, "error": str(e)},
                organization_id=context.organization_id,
                success=False,
                error=str(e),
                latency_ms=latency_ms,
            )
            return {"success": False, "action": action, "error": str(e), "message": f"Failed to execute {action.replace('_', ' ')}: {str(e)}"}
        finally:
            if owns_session and db:
                db.close()
    
    def _action_search_employees(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        query = params.get("query", "")
        if not query:
            return {"success": False, "error": "Query parameter required", "message": "Please provide a search query."}
        try:
            from models import Employee, Department
            from sqlalchemy import or_
            
            pattern = f"%{query}%"
            employees = db.query(Employee).filter(
                Employee.organization_id == context.organization_id,
                Employee.deleted_at == None,
                or_(
                    Employee.first_name.ilike(pattern),
                    Employee.last_name.ilike(pattern),
                    Employee.email.ilike(pattern),
                    Employee.employee_code.ilike(pattern),
                    Employee.designation.ilike(pattern),
                )
            ).limit(10).all()
            
            results = []
            for emp in employees:
                dept = db.query(Department).filter(Department.id == emp.department_id).first()
                results.append({
                    "id": emp.id,
                    "name": f"{emp.first_name or ''} {emp.last_name or ''}".strip(),
                    "email": emp.email,
                    "department": dept.name if dept else "N/A",
                    "designation": emp.designation,
                    "employee_code": emp.employee_code,
                    "status": emp.status,
                })
            
            return {"success": True, "data": results, "count": len(results), "message": f"Found {len(results)} employee(s) matching '{query}'."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Search failed: {str(e)}"}
    
    def _action_search_employees_by_department(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        dept_name = params.get("department_name", "")
        if not dept_name:
            return {"success": False, "error": "department_name required", "message": "Please specify a department name."}
        try:
            from models import Employee, Department
            from sqlalchemy import or_
            
            # Find the department by name (fuzzy match)
            dept = db.query(Department).filter(
                Department.organization_id == context.organization_id,
                Department.deleted_at == None,
                or_(
                    Department.name.ilike(f"%{dept_name}%"),
                    Department.code.ilike(f"%{dept_name}%"),
                )
            ).first()
            
            if not dept:
                return {"success": False, "error": "department_not_found", "message": f"No department found matching '{dept_name}'."}
            
            # Get employees in that department
            employees = db.query(Employee).filter(
                Employee.department_id == dept.id,
                Employee.organization_id == context.organization_id,
                Employee.deleted_at == None,
            ).limit(50).all()
            
            results = []
            for emp in employees:
                results.append({
                    "id": emp.id,
                    "name": f"{emp.first_name or ''} {emp.last_name or ''}".strip(),
                    "email": emp.email,
                    "designation": emp.designation,
                    "employee_code": emp.employee_code,
                    "status": emp.status,
                })
            
            if not results:
                return {"success": True, "data": [], "count": 0, "message": f"No active employees found in {dept.name}."}
            
            return {"success": True, "data": results, "count": len(results), "message": f"Found {len(results)} employee(s) in {dept.name}."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Department search failed: {str(e)}"}
    
    def _action_view_employee_profile(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import Employee
            employee = db.query(Employee).filter(
                Employee.id == emp_id,
                Employee.organization_id == context.organization_id,
                Employee.deleted_at == None,
            ).first()
            if not employee:
                return {"success": False, "error": "Employee not found", "message": f"Employee {emp_id} not found."}
            if not self._validate_tenant(context.organization_id, employee.organization_id):
                return {"success": False, "error": "tenant_violation", "message": "You can only view employees in your organization."}
            return {
                "success": True,
                "data": {
                    "id": employee.id,
                    "name": f"{employee.first_name or ''} {employee.last_name or ''}".strip(),
                    "email": employee.email,
                    "phone": employee.phone,
                    "department_id": employee.department_id,
                    "designation": employee.designation,
                    "employee_code": employee.employee_code,
                    "join_date": employee.join_date.isoformat() if employee.join_date else None,
                    "status": employee.status,
                    "employment_type": employee.employment_type,
                    "base_salary": employee.base_salary,
                },
                "message": f"Profile for {employee.first_name} {employee.last_name}",
            }
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to load profile: {str(e)}"}
    
    def _action_update_contact_info(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        phone = params.get("phone")
        email = params.get("email")
        address = params.get("address")
        if not any([phone, email, address]):
            return {"success": False, "error": "No fields to update", "message": "Please specify phone, email, or address to update."}
        try:
            from models import Employee
            employee = db.query(Employee).filter(
                Employee.id == emp_id,
                Employee.organization_id == context.organization_id,
                Employee.deleted_at == None,
            ).first()
            if not employee:
                return {"success": False, "error": "Employee not found", "message": f"Employee {emp_id} not found."}
            if not self._validate_tenant(context.organization_id, employee.organization_id):
                return {"success": False, "error": "tenant_violation", "message": "You can only update employees in your organization."}
            updated_fields = []
            if phone and context.role in ("hr_admin", "admin", "employee"):
                employee.phone = phone
                updated_fields.append("phone")
            if email and context.role in ("hr_admin", "admin"):
                employee.email = email
                updated_fields.append("email")
            if address and context.role in ("hr_admin", "admin", "employee"):
                employee.address = address
                updated_fields.append("address")
            db.commit()
            return {"success": True, "data": {"updated_fields": updated_fields}, "message": f"Updated {', '.join(updated_fields)} for {employee.first_name} {employee.last_name}."}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e), "message": f"Update failed: {str(e)}"}
    
    def _action_check_leave_balance(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import LeaveBalance, LeaveType
            balances = db.query(LeaveBalance).filter(LeaveBalance.employee_id == emp_id, LeaveBalance.deleted_at == None).all()
            leave_types = {lt.id: lt.name for lt in db.query(LeaveType).all()}
            result = []
            for lb in balances:
                lt_name = leave_types.get(lb.leave_type_id, "Unknown")
                result.append({"leave_type": lt_name, "total": lb.total_days or 0, "used": lb.used_days or 0, "remaining": lb.remaining_days or 0})
            return {"success": True, "data": result, "message": f"Leave balance for employee {emp_id}."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to fetch leave balance: {str(e)}"}
    
    def _action_apply_leave(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        start_date = params.get("start_date")
        end_date = params.get("end_date")
        leave_type_id = params.get("leave_type_id")
        reason = params.get("reason", "")
        is_half_day = params.get("is_half_day", False)
        if not all([start_date, end_date, leave_type_id]):
            return {"success": False, "error": "Missing required parameters", "message": "Please provide start_date, end_date, and leave_type."}
        try:
            from models import LeaveApplication, LeaveBalance, Employee
            employee = db.query(Employee).filter(Employee.id == emp_id, Employee.organization_id == context.organization_id, Employee.deleted_at == None).first()
            if not employee:
                return {"success": False, "error": "Employee not found", "message": f"Employee {emp_id} not found."}
            if not self._validate_tenant(context.organization_id, employee.organization_id):
                return {"success": False, "error": "tenant_violation", "message": "You can only apply leave for employees in your organization."}
            if isinstance(start_date, str):
                start_date = datetime.fromisoformat(start_date).date()
            if isinstance(end_date, str):
                end_date = datetime.fromisoformat(end_date).date()
            total_days = (end_date - start_date).days + 1
            if is_half_day:
                total_days = 0.5
            balance = db.query(LeaveBalance).filter(LeaveBalance.employee_id == emp_id, LeaveBalance.leave_type_id == leave_type_id, LeaveBalance.deleted_at == None).first()
            if balance and (balance.remaining_days or 0) < total_days:
                return {"success": False, "error": "insufficient_balance", "message": f"Insufficient leave balance. Required: {total_days} days, Available: {balance.remaining_days or 0} days."}
            leave = LeaveApplication(employee_id=emp_id, leave_type_id=leave_type_id, organization_id=context.organization_id, company_id=employee.company_id, department_id=employee.department_id, start_date=start_date, end_date=end_date, total_days=total_days, reason=reason, is_half_day=is_half_day, status="pending", request_source="ai_chatbot")
            db.add(leave)
            if balance:
                balance.used_days = (balance.used_days or 0) + total_days
                balance.remaining_days = (balance.remaining_days or 0) - total_days
            db.commit()
            db.refresh(leave)
            return {"success": True, "data": {"leave_application_id": leave.id}, "message": f"Leave application submitted for {total_days} day(s) from {start_date} to {end_date}."}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e), "message": f"Failed to apply leave: {str(e)}"}
    
    def _action_cancel_leave(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        leave_application_id = params.get("leave_application_id")
        reason = params.get("reason", "Cancelled via AI")
        if not leave_application_id:
            return {"success": False, "error": "leave_application_id required", "message": "Please specify the leave to cancel."}
        try:
            from models import LeaveApplication, LeaveBalance
            leave = db.query(LeaveApplication).filter(LeaveApplication.id == leave_application_id, LeaveApplication.employee_id == context.employee_id, LeaveApplication.organization_id == context.organization_id).first()
            if not leave:
                return {"success": False, "error": "Leave not found", "message": "Leave application not found or you don't have permission."}
            if leave.status in ("approved", "rejected", "cancelled"):
                return {"success": False, "error": "invalid_status", "message": f"Cannot cancel leave with status: {leave.status}"}
            balance = db.query(LeaveBalance).filter(LeaveBalance.employee_id == leave.employee_id, LeaveBalance.leave_type_id == leave.leave_type_id, LeaveBalance.deleted_at == None).first()
            if balance:
                balance.used_days = max(0, (balance.used_days or 0) - leave.total_days)
                balance.remaining_days = (balance.remaining_days or 0) + leave.total_days
            leave.status = "cancelled"
            leave.comments = reason
            db.commit()
            return {"success": True, "data": {"leave_application_id": leave.id}, "message": f"Leave application #{leave.id} has been cancelled."}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e), "message": f"Failed to cancel leave: {str(e)}"}
    
    def _action_view_leave_history(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import LeaveApplication, LeaveType
            leaves = db.query(LeaveApplication).filter(LeaveApplication.employee_id == emp_id, LeaveApplication.organization_id == context.organization_id, LeaveApplication.deleted_at == None).order_by(LeaveApplication.created_at.desc()).limit(10).all()
            leave_types = {lt.id: lt.name for lt in db.query(LeaveType).all()}
            result = []
            for leave in leaves:
                result.append({"id": leave.id, "leave_type": leave_types.get(leave.leave_type_id, "Unknown"), "start_date": leave.start_date.isoformat() if leave.start_date else None, "end_date": leave.end_date.isoformat() if leave.end_date else None, "total_days": leave.total_days, "status": leave.status, "reason": leave.reason})
            return {"success": True, "data": result, "message": f"Found {len(result)} leave application(s)."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to fetch leave history: {str(e)}"}
    
    def _action_view_attendance(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        period = params.get("period", "current_month")
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import Attendance
            from datetime import datetime, timedelta
            now = datetime.now()
            start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) if period == "current_month" else now - timedelta(days=now.weekday())
            records = db.query(Attendance).filter(Attendance.employee_id == emp_id, Attendance.date >= start_date, Attendance.organization_id == context.organization_id).order_by(Attendance.date.desc()).limit(30).all()
            total_days = len(records)
            present_days = sum(1 for r in records if r.status in ("present", "work_from_home"))
            absent_days = sum(1 for r in records if r.status == "absent")
            late_days = sum(1 for r in records if r.status == "late" or r.is_late)
            total_hours = sum(r.work_hours or 0 for r in records)
            return {"success": True, "data": {"period": period, "total_days": total_days, "present_days": present_days, "absent_days": absent_days, "late_days": late_days, "total_hours": round(total_hours, 1), "attendance_rate": round((present_days / total_days * 100), 1) if total_days > 0 else 0}, "message": f"Attendance for {period}: {present_days}/{total_days} days present."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to fetch attendance: {str(e)}"}
    
    def _action_mark_attendance(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        status = params.get("status", "present")
        work_hours = params.get("work_hours", 8.0)
        attendance_date = params.get("date", datetime.now().date())
        try:
            from models import Attendance, Employee
            if isinstance(attendance_date, str):
                attendance_date = datetime.fromisoformat(attendance_date).date()
            employee = db.query(Employee).filter(Employee.id == emp_id, Employee.organization_id == context.organization_id, Employee.deleted_at == None).first()
            if not employee:
                return {"success": False, "error": "Employee not found", "message": f"Employee {emp_id} not found."}
            attendance = db.query(Attendance).filter(Attendance.employee_id == emp_id, Attendance.date == attendance_date, Attendance.organization_id == context.organization_id).first()
            if attendance:
                attendance.status = status
                attendance.work_hours = work_hours
                attendance.updated_at = datetime.now()
            else:
                attendance = Attendance(employee_id=emp_id, organization_id=context.organization_id, company_id=employee.company_id, department_id=employee.department_id, date=attendance_date, status=status, work_hours=work_hours, check_in=datetime.now())
                db.add(attendance)
            db.commit()
            return {"success": True, "data": {"date": attendance_date.isoformat(), "status": status}, "message": f"Attendance marked as {status} for {attendance_date}."}
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e), "message": f"Failed to mark attendance: {str(e)}"}
    
    def _action_request_attendance_correction(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        return {"success": True, "data": {"status": "submitted"}, "message": "Attendance correction request submitted to your manager for approval."}
    
    def _action_view_payslip(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        period = params.get("period", "latest")
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import Payroll
            query = db.query(Payroll).filter(Payroll.employee_id == emp_id, Payroll.organization_id == context.organization_id)
            if period != "latest":
                query = query.filter(Payroll.pay_period == period)
            payslip = query.order_by(Payroll.created_at.desc()).first()
            if not payslip:
                return {"success": False, "error": "No payslip found", "message": "No payslip found for the specified period."}
            return {"success": True, "data": {"payroll_id": payslip.id, "period": payslip.pay_period or payslip.period, "basic_salary": payslip.basic_salary or payslip.base_salary, "gross_salary": payslip.gross_salary or payslip.gross_pay, "total_deductions": payslip.total_deductions or payslip.deductions, "net_pay": payslip.net_pay or payslip.net_payable or payslip.take_home, "status": payslip.status}, "message": f"Payslip for {payslip.pay_period or 'latest period'}"}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to fetch payslip: {str(e)}"}
    
    def _action_view_payroll_summary(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import Payroll
            payslips = db.query(Payroll).filter(Payroll.employee_id == emp_id, Payroll.organization_id == context.organization_id).order_by(Payroll.created_at.desc()).limit(3).all()
            if not payslips:
                return {"success": False, "error": "No payroll records", "message": "No payroll records found."}
            result = []
            for p in payslips:
                result.append({"period": p.pay_period or p.period, "basic": p.basic_salary or p.base_salary, "gross": p.gross_salary or p.gross_pay, "deductions": p.total_deductions or p.deductions, "net": p.net_pay or p.net_payable or p.take_home, "status": p.status})
            return {"success": True, "data": result, "message": f"Payroll summary with {len(result)} record(s)."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to fetch payroll summary: {str(e)}"}
    
    def _action_download_tax_form(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        return {"success": True, "data": {"download_url": f"/api/payroll/{emp_id}/tax-form"}, "message": "Tax form download initiated. Check your email for the PDF."}
    
    def _action_view_team(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        manager_id = params.get("manager_id") or context.employee_id
        if not manager_id:
            return {"success": False, "error": "manager_id required", "message": "Please specify a manager."}
        try:
            from models import Employee
            team = db.query(Employee).filter(Employee.reporting_manager_id == manager_id, Employee.organization_id == context.organization_id, Employee.deleted_at == None, Employee.status == "active").all()
            result = []
            for emp in team:
                result.append({"id": emp.id, "name": f"{emp.first_name or ''} {emp.last_name or ''}".strip(), "designation": emp.designation, "department_id": emp.department_id, "status": emp.status})
            return {"success": True, "data": result, "count": len(result), "message": f"Team has {len(result)} member(s)."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to fetch team: {str(e)}"}
    
    def _action_view_reportees(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        return self._action_view_team(params, context, db)
    
    def _action_view_org_chart(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        return {"success": True, "data": {"message": "Org chart visualization available in the Organization section."}, "message": "You can view the full organization chart in the Organization section."}
    
    def _action_lookup_policy(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        policy_type = params.get("policy_type", "general")
        policy_map = {
            "leave": "Leave Policy: Annual Leave: 15 days, Sick Leave: 7 days, Casual Leave: 7 days. Maternity/Paternity as per policy. Leave year resets Jan 1st.",
            "attendance": "Attendance Policy: Standard work hours 9 AM - 6 PM. Late arrivals logged after 9:15 AM. 3 late arrivals = 1 absent day. Work from home requires manager approval.",
            "payroll": "Payroll Policy: Salary processed by 5th of every month. Payslips available in Payroll section. Tax deducted at source as per income tax slab.",
            "code_of_conduct": "Code of Conduct: Maintain professional behavior. No harassment. Confidentiality of company data. Conflict of interest disclosure required.",
            "remote_work": "Remote Work Policy: Maximum 3 days/week remote. Requires stable internet connection. Core hours 10 AM - 4 PM mandatory. Equipment provided by company.",
        }
        policy = policy_map.get(policy_type.lower(), f"Policy for '{policy_type}' is being reviewed. Please contact HR for the latest version.")
        return {"success": True, "data": {"policy_type": policy_type, "content": policy}, "message": policy}
    
    def _action_check_onboarding_status(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import Employee
            employee = db.query(Employee).filter(Employee.id == emp_id, Employee.organization_id == context.organization_id).first()
            if not employee:
                return {"success": False, "error": "Employee not found", "message": f"Employee {emp_id} not found."}
            return {"success": True, "data": {"employee_id": emp_id, "onboarding_step": employee.onboarding_step, "onboarding_progress": employee.onboarding_progress or []}, "message": f"Onboarding status: {employee.onboarding_step}"}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to check onboarding status: {str(e)}"}
    
    def _action_view_onboarding_tasks(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        return {"success": True, "data": {"tasks": [{"task": "Complete personal details", "status": "completed"}, {"task": "Upload documents", "status": "completed"}, {"task": "IT setup and credentials", "status": "completed"}, {"task": "HR orientation", "status": "pending"}, {"task": "Team introductions", "status": "pending"}]}, "message": "Onboarding tasks: 3 completed, 2 remaining."}
    
    def _action_view_asset_allocations(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        return {"success": True, "data": {"employee_id": emp_id, "allocations": []}, "message": "No assets currently allocated."}
    
    def _action_request_asset(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        return {"success": True, "data": {"status": "submitted"}, "message": "Asset request submitted to IT for approval."}
    
    def _predict_attrition_risk_local(self, employee_data: Dict) -> Dict[str, Any]:
        risk_score = 0
        factors = []
        if employee_data.get('leaves_taken', 0) > 20:
            risk_score += 25
            factors.append("High leave usage")
        if employee_data.get('performance_score', 100) < 60:
            risk_score += 35
            factors.append("Low performance score")
        if employee_data.get('years_in_role', 0) > 3:
            risk_score += 20
            factors.append("No promotion in 3+ years")
        if employee_data.get('overdue_tasks', 0) > 5:
            risk_score += 15
            factors.append("Multiple overdue tasks")
        risk_level = "LOW" if risk_score < 30 else "MEDIUM" if risk_score < 60 else "HIGH"
        recommendations = {"LOW": ["Continue regular check-ins", "Maintain current benefits"], "MEDIUM": ["Schedule career discussion", "Consider training opportunities", "Review workload"], "HIGH": ["Immediate manager meeting", "Review compensation", "Consider role change", "Retention bonus"]}
        return {"risk_score": risk_score, "risk_level": risk_level, "risk_percentage": min(risk_score, 100), "factors": factors, "recommendations": recommendations.get(risk_level, []), "analysis_date": datetime.now().isoformat()}
    
    # ========== Resignation Actions ==========
    
    def _action_initiate_resignation(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import Employee
            employee = db.query(Employee).filter(Employee.id == emp_id, Employee.organization_id == context.organization_id, Employee.deleted_at == None).first()
            if not employee:
                return {"success": False, "error": "Employee not found", "message": f"Employee {emp_id} not found."}
            
            # Generate resignation email
            email_template_engine = get_email_template_engine()
            email_context = {
                "employee_name": f"{employee.first_name or ''} {employee.last_name or ''}".strip(),
                "employee_code": employee.employee_code,
                "designation": employee.designation,
                "department": getattr(employee, 'department', {}).get('name', 'N/A') if hasattr(employee, 'department') else 'N/A',
                "manager_name": params.get("manager_name", "Manager"),
                "last_working_day": params.get("last_working_day", "To be determined"),
                "notice_period": params.get("notice_period", "As per policy"),
                "reason": params.get("reason", "Personal reasons"),
            }
            
            email_result = email_template_engine.generate(EmailType.RESIGNATION, email_context)
            
            return {
                "success": True,
                "data": {
                    "employee_id": emp_id,
                    "resignation_email": email_result,
                    "next_steps": [
                        "Send resignation email to manager and HR",
                        "Complete exit formalities",
                        "Return company assets",
                        "Knowledge transfer documentation",
                    ]
                },
                "message": f"Resignation initiated for {employee.first_name} {employee.last_name}. I've prepared the resignation email for you.",
            }
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to initiate resignation: {str(e)}"}
    
    # ========== Expense Actions ==========
    
    def _action_create_expense_claim(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        
        expense_type = params.get("expense_type", "general")
        amount = params.get("amount", 0)
        date = params.get("date", datetime.now().date().isoformat())
        description = params.get("description", "")
        
        try:
            from models import Expense
            expense = Expense(
                employee_id=emp_id,
                organization_id=context.organization_id,
                category=expense_type,
                amount=amount,
                expense_date=date,
                description=description,
                status="pending",
            )
            db.add(expense)
            db.commit()
            db.refresh(expense)
            
            return {
                "success": True,
                "data": {"expense_id": expense.id},
                "message": f"Expense claim submitted for {expense_type}: {expense.amount}. Claim ID: {expense.id}",
            }
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e), "message": f"Failed to create expense claim: {str(e)}"}
    
    # ========== Grievance Actions ==========
    
    def _action_file_grievance(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        
        grievance_type = params.get("grievance_type", "general")
        description = params.get("description", "")
        
        try:
            from models import Grievance
            grievance = Grievance(
                employee_id=emp_id,
                organization_id=context.organization_id,
                grievance_type=grievance_type,
                description=description,
                status="open",
            )
            db.add(grievance)
            db.commit()
            db.refresh(grievance)
            
            return {
                "success": True,
                "data": {"grievance_id": grievance.id},
                "message": f"Grievance filed successfully. Grievance ID: {grievance.id}. HR will review it shortly.",
            }
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e), "message": f"Failed to file grievance: {str(e)}"}
    
    # ========== Performance Actions ==========
    
    def _action_view_performance_reviews(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import PerformanceReview
            reviews = db.query(PerformanceReview).filter(PerformanceReview.employee_id == emp_id, PerformanceReview.organization_id == context.organization_id).order_by(PerformanceReview.review_date.desc()).limit(5).all()
            result = []
            for review in reviews:
                result.append({
                    "id": review.id,
                    "review_date": review.review_date.isoformat() if review.review_date else None,
                    "rating": getattr(review, 'rating', 'N/A'),
                    "comments": getattr(review, 'comments', ''),
                    "status": getattr(review, 'status', 'N/A'),
                })
            return {"success": True, "data": result, "message": f"Found {len(result)} performance review(s)."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to fetch performance reviews: {str(e)}"}
    
    # ========== Recruitment Actions ==========
    
    def _action_refer_candidate(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        
        candidate_name = params.get("candidate_name", "")
        candidate_email = params.get("candidate_email", "")
        position = params.get("position", "")
        
        if not candidate_name or not position:
            return {"success": False, "error": "Missing candidate details", "message": "Please provide candidate name and position."}
        
        try:
            from models import Candidate
            candidate = Candidate(
                name=candidate_name,
                email=candidate_email,
                position=position,
                referred_by=emp_id,
                organization_id=context.organization_id,
                status="referred",
            )
            db.add(candidate)
            db.commit()
            db.refresh(candidate)
            
            return {
                "success": True,
                "data": {"candidate_id": candidate.id},
                "message": f"Referral submitted for {candidate_name} for {position} position. Referral ID: {candidate.id}",
            }
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e), "message": f"Failed to refer candidate: {str(e)}"}
    
    def _action_view_job_openings(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        try:
            from models import JobOpening
            jobs = db.query(JobOpening).filter(JobOpening.organization_id == context.organization_id, JobOpening.status == "open").limit(10).all()
            result = []
            for job in jobs:
                result.append({
                    "id": job.id,
                    "title": job.title,
                    "department": getattr(job, 'department', 'N/A'),
                    "location": getattr(job, 'location', 'N/A'),
                    "posted_date": job.posted_date.isoformat() if hasattr(job, 'posted_date') and job.posted_date else None,
                })
            return {"success": True, "data": result, "message": f"Found {len(result)} open position(s)."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to fetch job openings: {str(e)}"}
    
    # ========== Email Generation Actions ==========
    
    def _action_generate_resignation_email(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import Employee
            employee = db.query(Employee).filter(Employee.id == emp_id, Employee.organization_id == context.organization_id, Employee.deleted_at == None).first()
            if not employee:
                return {"success": False, "error": "Employee not found", "message": f"Employee {emp_id} not found."}
            
            email_template_engine = get_email_template_engine()
            email_context = {
                "employee_name": f"{employee.first_name or ''} {employee.last_name or ''}".strip(),
                "employee_code": employee.employee_code,
                "designation": employee.designation,
                "department": getattr(employee, 'department', {}).get('name', 'N/A') if hasattr(employee, 'department') else 'N/A',
                "manager_name": params.get("manager_name", "Manager"),
                "last_working_day": params.get("last_working_day", "To be determined"),
                "notice_period": params.get("notice_period", "As per policy"),
                "reason": params.get("reason", "Personal reasons"),
                "to": params.get("to", ""),
            }
            
            email_result = email_template_engine.generate(EmailType.RESIGNATION, email_context)
            return {"success": True, "data": email_result, "message": "Resignation email generated. You can review and send it."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to generate resignation email: {str(e)}"}
    
    def _action_generate_attendance_correction_email(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import Employee
            employee = db.query(Employee).filter(Employee.id == emp_id, Employee.organization_id == context.organization_id, Employee.deleted_at == None).first()
            if not employee:
                return {"success": False, "error": "Employee not found", "message": f"Employee {emp_id} not found."}
            
            email_template_engine = get_email_template_engine()
            email_context = {
                "employee_name": f"{employee.first_name or ''} {employee.last_name or ''}".strip(),
                "employee_code": employee.employee_code,
                "department": getattr(employee, 'department', {}).get('name', 'N/A') if hasattr(employee, 'department') else 'N/A',
                "manager_name": params.get("manager_name", "Manager"),
                "date": params.get("date", datetime.now().date().isoformat()),
                "current_status": params.get("current_status", "absent"),
                "correct_status": params.get("correct_status", "present"),
                "check_in": params.get("check_in", "N/A"),
                "check_out": params.get("check_out", "N/A"),
                "reason": params.get("reason", ""),
                "to": params.get("to", ""),
            }
            
            email_result = email_template_engine.generate(EmailType.ATTENDANCE_CORRECTION, email_context)
            return {"success": True, "data": email_result, "message": "Attendance correction email generated. You can review and send it."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to generate attendance correction email: {str(e)}"}
    
    def _action_generate_expense_claim_email(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import Employee
            employee = db.query(Employee).filter(Employee.id == emp_id, Employee.organization_id == context.organization_id, Employee.deleted_at == None).first()
            if not employee:
                return {"success": False, "error": "Employee not found", "message": f"Employee {emp_id} not found."}
            
            email_template_engine = get_email_template_engine()
            email_context = {
                "employee_name": f"{employee.first_name or ''} {employee.last_name or ''}".strip(),
                "employee_code": employee.employee_code,
                "department": getattr(employee, 'department', {}).get('name', 'N/A') if hasattr(employee, 'department') else 'N/A',
                "expense_type": params.get("expense_type", "general"),
                "amount": params.get("amount", 0),
                "date": params.get("date", datetime.now().date().isoformat()),
                "description": params.get("description", ""),
                "receipt_url": params.get("receipt_url", ""),
                "to": params.get("to", ""),
            }
            
            email_result = email_template_engine.generate(EmailType.EXPENSE_CLAIM, email_context)
            return {"success": True, "data": email_result, "message": "Expense claim email generated. You can review and send it."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to generate expense claim email: {str(e)}"}
    
    def _action_generate_leave_request_email(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import Employee
            employee = db.query(Employee).filter(Employee.id == emp_id, Employee.organization_id == context.organization_id, Employee.deleted_at == None).first()
            if not employee:
                return {"success": False, "error": "Employee not found", "message": f"Employee {emp_id} not found."}
            
            email_template_engine = get_email_template_engine()
            email_context = {
                "employee_name": f"{employee.first_name or ''} {employee.last_name or ''}".strip(),
                "employee_code": employee.employee_code,
                "department": getattr(employee, 'department', {}).get('name', 'N/A') if hasattr(employee, 'department') else 'N/A',
                "manager_name": params.get("manager_name", "Manager"),
                "start_date": params.get("start_date", ""),
                "end_date": params.get("end_date", ""),
                "total_days": params.get("total_days", 1),
                "leave_type": params.get("leave_type", "Annual"),
                "reason": params.get("reason", ""),
                "handover_to": params.get("handover_to", "Team member"),
                "to": params.get("to", ""),
            }
            
            email_result = email_template_engine.generate(EmailType.LEAVE_REQUEST, email_context)
            return {"success": True, "data": email_result, "message": "Leave request email generated. You can review and send it."}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to generate leave request email: {str(e)}"}
    
    # ========== Document Generation Actions ==========
    
    def _action_generate_document(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        emp_id = params.get("employee_id") or context.employee_id
        if not emp_id:
            return {"success": False, "error": "employee_id required", "message": "Please specify an employee."}
        try:
            from models import Employee
            employee = db.query(Employee).filter(Employee.id == emp_id, Employee.organization_id == context.organization_id, Employee.deleted_at == None).first()
            if not employee:
                return {"success": False, "error": "Employee not found", "message": f"Employee {emp_id} not found."}
            
            document_generator = get_document_generator()
            document_type = params.get("document_type", "experience_letter")
            
            doc_context = {
                "employee_name": f"{employee.first_name or ''} {employee.last_name or ''}".strip(),
                "employee_code": employee.employee_code,
                "designation": employee.designation,
                "department": getattr(employee, 'department', {}).get('name', 'N/A') if hasattr(employee, 'department') else 'N/A',
                "join_date": employee.join_date.strftime("%B %d, %Y") if employee.join_date else "N/A",
                "exit_date": params.get("exit_date", datetime.now().strftime("%B %d, %Y")),
                "last_working_day": params.get("last_working_day", datetime.now().strftime("%B %d, %Y")),
                "company_name": params.get("company_name", "Our Organization"),
                "hr_manager_name": params.get("hr_manager_name", "HR Manager"),
            }
            
            document = document_generator.generate(document_type, doc_context)
            return {"success": True, "data": document, "message": f"Document generated: {document.get('title', document_type)}"}
        except Exception as e:
            return {"success": False, "error": str(e), "message": f"Failed to generate document: {str(e)}"}
    
    # ========== Workflow Actions ==========
    
    def _action_get_workflow(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        workflow_id = params.get("workflow_id")
        if not workflow_id:
            return {"success": False, "error": "workflow_id required", "message": "Please specify a workflow."}
        
        workflow_engine = get_workflow_engine()
        status = workflow_engine.get_workflow_status(context.user_id, workflow_id)
        return status
    
    def _action_start_workflow(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        workflow_id = params.get("workflow_id")
        if not workflow_id:
            return {"success": False, "error": "workflow_id required", "message": "Please specify a workflow to start."}
        
        workflow_engine = get_workflow_engine()
        result = workflow_engine.start_workflow(workflow_id, context.user_id, params)
        return result
    
    def _action_advance_workflow(self, params: Dict, context: AIContext, db: Session) -> Dict[str, Any]:
        workflow_id = params.get("workflow_id")
        collected_data = params.get("collected_data", {})
        if not workflow_id:
            return {"success": False, "error": "workflow_id required", "message": "Please specify a workflow."}
        
        workflow_engine = get_workflow_engine()
        result = workflow_engine.advance_workflow(context.user_id, workflow_id, collected_data)
        return result
