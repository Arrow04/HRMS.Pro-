"""
HRMS AI Autonomous HR Engine
Enables the AI to function as a complete HR department for small companies
without dedicated HR staff. Handles approvals, reminders, policy enforcement,
proactive tasks, and end-to-end HR workflows autonomously.
"""
import json
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta, date
from enum import Enum
from dataclasses import dataclass, field

from hrms_ai.schemas import AIContext
from hrms_ai.audit import get_ai_audit_logger, AuditEventType, AuditSeverity
from hrms_ai.escalation import get_escalation_manager, EscalationReason, EscalationPriority
from hrms_ai.email_templates import get_email_template_engine, EmailType
from hrms_ai.documents import get_document_generator, DocumentType
from hrms_ai.workflows import get_workflow_engine


class AutoApprovalStatus(str, Enum):
    AUTO_APPROVED = "auto_approved"
    NEEDS_APPROVAL = "needs_approval"
    ESCALATED = "escalated"
    REJECTED = "rejected"


class ProactiveTaskType(str, Enum):
    LEAVE_REMINDER = "leave_reminder"
    ATTENDANCE_ALERT = "attendance_alert"
    DOCUMENT_EXPIRY = "document_expiry"
    PROBATION_END = "probation_end"
    CONTRACT_RENEWAL = "contract_renewal"
    BIRTHDAY = "birthday"
    WORK_ANNIVERSARY = "work_anniversary"
    POLICY_ACKNOWLEDGMENT = "policy_acknowledgment"
    TRAINING_REMINDER = "training_reminder"
    PAYROLL_NOTIFICATION = "payroll_notification"


@dataclass
class AutoApprovalRule:
    rule_id: str
    name: str
    action_type: str
    conditions: Dict[str, Any]
    auto_approve: bool
    notify_hr: bool
    escalation_required: bool
    priority: str = "medium"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "name": self.name,
            "action_type": self.action_type,
            "conditions": self.conditions,
            "auto_approve": self.auto_approve,
            "notify_hr": self.notify_hr,
            "escalation_required": self.escalation_required,
            "priority": self.priority,
        }


@dataclass
class ProactiveTask:
    task_id: str
    task_type: ProactiveTaskType
    employee_id: int
    organization_id: int
    company_id: Optional[int]
    scheduled_date: str
    description: str
    actions: List[Dict[str, Any]]
    status: str = "pending"
    created_at: str = ""
    
    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now().isoformat()


class CompanyPolicyEngine:
    """Reads and enforces company-specific HR policies from database and settings"""
    
    def __init__(self, db_session_factory=None):
        self.db_session_factory = db_session_factory
    
    def _get_db(self):
        if self.db_session_factory:
            return self.db_session_factory()
        return None
    
    def get_leave_policy(self, organization_id: int, company_id: Optional[int] = None) -> Dict[str, Any]:
        """Get company's leave policy"""
        db = self._get_db()
        if not db:
            return self._default_leave_policy()
        
        try:
            from models import LeaveType, AttendancePolicy
            
            policy = {
                "leave_types": [],
                "carry_forward_allowed": False,
                "max_consecutive_days": 15,
                "advance_notice_days": 1,
                "auto_approve_threshold_days": 3,
            }
            
            leave_types = db.query(LeaveType).filter(
                LeaveType.organization_id == organization_id,
                LeaveType.deleted_at == None,
            ).all()
            
            for lt in leave_types:
                policy["leave_types"].append({
                    "id": lt.id,
                    "name": lt.name,
                    "code": getattr(lt, 'code', None),
                    "max_days": getattr(lt, 'max_days', None),
                    "is_carry_forward": getattr(lt, 'is_carry_forward', False),
                    "is_paid": getattr(lt, 'is_paid', True),
                })
            
            return policy
        except Exception:
            return self._default_leave_policy()
        finally:
            if db:
                db.close()
    
    def get_attendance_policy(self, organization_id: int, company_id: Optional[int] = None) -> Dict[str, Any]:
        """Get company's attendance policy"""
        db = self._get_db()
        if not db:
            return self._default_attendance_policy()
        
        try:
            from models import AttendancePolicy
            
            policy = self._default_attendance_policy()
            
            attendance_policies = db.query(AttendancePolicy).filter(
                AttendancePolicy.organization_id == organization_id,
                AttendancePolicy.deleted_at == None,
            ).all()
            
            if attendance_policies:
                ap = attendance_policies[0]
                policy = {
                    "work_start_time": getattr(ap, 'work_start_time', '09:00'),
                    "work_end_time": getattr(ap, 'work_end_time', '18:00'),
                    "late_threshold_minutes": getattr(ap, 'late_threshold_minutes', 15),
                    "half_day_threshold_hours": getattr(ap, 'half_day_threshold_hours', 4),
                    "overtime_eligible": getattr(ap, 'overtime_eligible', False),
                    "weekend_policy": getattr(ap, 'weekend_policy', 'rest'),
                }
            
            return policy
        except Exception:
            return self._default_attendance_policy()
        finally:
            if db:
                db.close()
    
    def get_payroll_policy(self, organization_id: int, company_id: Optional[int] = None) -> Dict[str, Any]:
        """Get company's payroll policy"""
        db = self._get_db()
        if not db:
            return self._default_payroll_policy()
        
        try:
            from models import PayrollPolicy
            
            policy = self._default_payroll_policy()
            
            payroll_policies = db.query(PayrollPolicy).filter(
                PayrollPolicy.organization_id == organization_id,
                PayrollPolicy.deleted_at == None,
            ).all()
            
            if payroll_policies:
                pp = payroll_policies[0]
                policy = {
                    "pay_cycle": getattr(pp, 'pay_cycle', 'monthly'),
                    "pay_date": getattr(pp, 'pay_date', 5),
                    "overtime_rate": getattr(pp, 'overtime_rate', 1.5),
                    "deduction_rules": getattr(pp, 'deduction_rules', {}),
                }
            
            return policy
        except Exception:
            return self._default_payroll_policy()
        finally:
            if db:
                db.close()
    
    def get_company_settings(self, organization_id: int, company_id: Optional[int] = None) -> Dict[str, Any]:
        """Get company-wide settings"""
        db = self._get_db()
        if not db:
            return {}
        
        try:
            from models import Organization, Company
            
            settings = {}
            
            if organization_id:
                org = db.query(Organization).filter(Organization.id == organization_id).first()
                if org:
                    settings["organization"] = {
                        "name": org.name,
                        "industry": getattr(org, "industry", None),
                        "country": getattr(org, "country", None),
                        "timezone": getattr(org, "timezone", "Asia/Kolkata"),
                        "currency": getattr(org, "default_currency", "INR"),
                        "date_format": getattr(org, "date_format", "YYYY-MM-DD"),
                        "data_retention_policy": getattr(org, "data_retention_policy", "1 yr"),
                    }
            
            if company_id:
                company = db.query(Company).filter(Company.id == company_id).first()
                if company and hasattr(company, 'settings') and company.settings:
                    settings["company"] = company.settings if isinstance(company.settings, dict) else {}
            
            return settings
        except Exception:
            return {}
        finally:
            if db:
                db.close()
    
    def _default_leave_policy(self) -> Dict[str, Any]:
        return {
            "leave_types": [
                {"name": "Annual", "max_days": 21, "is_carry_forward": True},
                {"name": "Sick", "max_days": 10, "is_carry_forward": False},
                {"name": "Casual", "max_days": 7, "is_carry_forward": False},
            ],
            "carry_forward_allowed": True,
            "max_consecutive_days": 15,
            "advance_notice_days": 1,
            "auto_approve_threshold_days": 3,
        }
    
    def _default_attendance_policy(self) -> Dict[str, Any]:
        return {
            "work_start_time": "09:00",
            "work_end_time": "18:00",
            "late_threshold_minutes": 15,
            "half_day_threshold_hours": 4,
            "overtime_eligible": False,
            "weekend_policy": "rest",
        }
    
    def _default_payroll_policy(self) -> Dict[str, Any]:
        return {
            "pay_cycle": "monthly",
            "pay_date": 5,
            "overtime_rate": 1.5,
            "deduction_rules": {},
        }


class AutoApprovalEngine:
    """Automatically approves HR requests based on company policies"""
    
    def __init__(self, policy_engine: CompanyPolicyEngine):
        self.policy_engine = policy_engine
        self.audit = get_ai_audit_logger()
        self.escalation_manager = get_escalation_manager()
    
    def evaluate_leave_request(
        self,
        employee_id: int,
        leave_type_id: int,
        start_date: date,
        end_date: date,
        total_days: float,
        organization_id: int,
        company_id: Optional[int] = None,
    ) -> Tuple[AutoApprovalStatus, str, Optional[str]]:
        """Evaluate if a leave request can be auto-approved"""
        policy = self.policy_engine.get_leave_policy(organization_id, company_id)
        
        # Check consecutive days limit
        if total_days > policy.get("max_consecutive_days", 15):
            return AutoApprovalStatus.NEEDS_APPROVAL, f"Leave exceeds maximum consecutive days ({policy.get('max_consecutive_days', 15)})", None
        
        # Check auto-approve threshold
        if total_days <= policy.get("auto_approve_threshold_days", 3):
            return AutoApprovalStatus.AUTO_APPROVED, f"Auto-approved: within {policy.get('auto_approve_threshold_days', 3)} days threshold", None
        
        return AutoApprovalStatus.NEEDS_APPROVAL, "Requires manager/HR approval", None
    
    def evaluate_attendance_correction(
        self,
        employee_id: int,
        correction_type: str,
        organization_id: int,
        company_id: Optional[int] = None,
    ) -> Tuple[AutoApprovalStatus, str, Optional[str]]:
        """Evaluate if an attendance correction can be auto-approved"""
        policy = self.policy_engine.get_attendance_policy(organization_id, company_id)
        
        # Simple auto-approve for minor corrections
        if correction_type in ["check_in", "check_out"]:
            return AutoApprovalStatus.AUTO_APPROVED, "Minor attendance correction auto-approved", None
        
        return AutoApprovalStatus.NEEDS_APPROVAL, "Attendance correction requires approval", None
    
    def evaluate_expense_claim(
        self,
        amount: float,
        expense_type: str,
        organization_id: int,
        company_id: Optional[int] = None,
    ) -> Tuple[AutoApprovalStatus, str, Optional[str]]:
        """Evaluate if an expense claim can be auto-approved"""
        from core.format_utils import currency_symbol, org_currency_code
        _sym = currency_symbol(org_currency_code(None))
        # Auto-approve small amounts
        if amount <= 5000:
            return AutoApprovalStatus.AUTO_APPROVED, f"Auto-approved: amount {_sym}{amount} within threshold", None
        
        if amount <= 20000:
            return AutoApprovalStatus.NEEDS_APPROVAL, "Requires manager approval", "manager"
        
        return AutoApprovalStatus.NEEDS_APPROVAL, "Requires HR approval", "hr_admin"


class ProactiveAssistant:
    """Proactive HR assistant that anticipates needs and sends reminders"""
    
    def __init__(self, db_session_factory=None, policy_engine=None):
        self.db_session_factory = db_session_factory
        self.policy_engine = policy_engine or CompanyPolicyEngine(db_session_factory)
        self.audit = get_ai_audit_logger()
        self.email_engine = get_email_template_engine()
        self._scheduled_tasks: List[ProactiveTask] = []
    
    def generate_daily_tasks(self, organization_id: int, company_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """Generate daily proactive HR tasks"""
        tasks = []
        db = self.db_session_factory() if self.db_session_factory else None
        
        if not db:
            return tasks
        
        try:
            from models import Employee, LeaveApplication, Attendance, Payroll, PerformanceReview
            from datetime import datetime, timedelta, date
            
            today = datetime.now().date()
            
            # 1. Check pending leave approvals
            pending_leaves = db.query(LeaveApplication).filter(
                LeaveApplication.organization_id == organization_id,
                LeaveApplication.status == "pending",
                LeaveApplication.deleted_at == None,
            ).limit(20).all()
            
            for leave in pending_leaves:
                employee = db.query(Employee).filter(Employee.id == leave.employee_id).first()
                if employee:
                    days_pending = (today - leave.created_at.date()).days if leave.created_at else 0
                    if days_pending >= 2:
                        tasks.append({
                            "type": "leave_approval_pending",
                            "priority": "high",
                            "title": f"Leave approval pending for {employee.first_name} {employee.last_name}",
                            "description": f"Leave request for {leave.total_days} days from {leave.start_date} to {leave.end_date} is pending for {days_pending} days.",
                            "action": "approve_leave",
                            "entity_id": leave.id,
                            "employee_id": employee.id,
                        })
            
            # 2. Check attendance anomalies
            yesterday = today - timedelta(days=1)
            absent_count = db.query(Attendance).filter(
                Attendance.organization_id == organization_id,
                Attendance.date == yesterday,
                Attendance.status == "absent",
                Attendance.deleted_at == None,
            ).count()
            
            if absent_count > 0:
                tasks.append({
                    "type": "attendance_anomaly",
                    "priority": "medium",
                    "title": f"{absent_count} employees absent yesterday",
                    "description": f"Follow up on absences for {yesterday}",
                    "action": "review_attendance",
                })
            
            # 3. Check payroll status
            if today.day == 1:
                tasks.append({
                    "type": "payroll_processing",
                    "priority": "high",
                    "title": "Monthly payroll processing due",
                    "description": "Process payroll for the previous month",
                    "action": "process_payroll",
                })
            
            # 4. Check probation completions
            probation_ending = db.query(Employee).filter(
                Employee.organization_id == organization_id,
                Employee.deleted_at == None,
                Employee.status == "active",
            ).all()
            
            for emp in probation_ending:
                if hasattr(emp, 'probation_end_date') and emp.probation_end_date:
                    if emp.probation_end_date <= today + timedelta(days=7):
                        tasks.append({
                            "type": "probation_ending",
                            "priority": "medium",
                            "title": f"Probation ending for {emp.first_name} {emp.last_name}",
                            "description": f"Probation ends on {emp.probation_end_date}. Prepare confirmation letter.",
                            "action": "process_probation_completion",
                            "employee_id": emp.id,
                        })
            
            # 5. Check birthdays and anniversaries
            for emp in probation_ending:
                if emp.date_of_birth and emp.date_of_birth.month == today.month and emp.date_of_birth.day == today.day:
                    tasks.append({
                        "type": "birthday",
                        "priority": "low",
                        "title": f"Birthday: {emp.first_name} {emp.last_name}",
                        "description": f"Send birthday wishes to {emp.first_name}",
                        "action": "send_birthday_greeting",
                        "employee_id": emp.id,
                    })
                
                if emp.join_date and emp.join_date.month == today.month and emp.join_date.day == today.day:
                    years = today.year - emp.join_date.year
                    tasks.append({
                        "type": "work_anniversary",
                        "priority": "low",
                        "title": f"Work anniversary: {emp.first_name} {emp.last_name} ({years} years)",
                        "description": f"Celebrate {emp.first_name}'s {years} year anniversary",
                        "action": "send_anniversary_greeting",
                        "employee_id": emp.id,
                    })
            
            # Sort by priority
            priority_order = {"high": 0, "medium": 1, "low": 2}
            tasks.sort(key=lambda x: priority_order.get(x.get("priority", "low"), 2))
            
        except Exception as e:
            self.audit.log_error(
                user_id="system",
                error_type="proactive",
                error_message=str(e),
                metadata={"operation": "generate_daily_tasks", "organization_id": organization_id},
            )
        finally:
            if db:
                db.close()
        
        return tasks
    
    def get_upcoming_tasks(self, organization_id: int, days: int = 7) -> List[Dict[str, Any]]:
        """Get upcoming HR tasks for the next N days"""
        tasks = []
        db = self.db_session_factory() if self.db_session_factory else None
        
        if not db:
            return tasks
        
        try:
            from models import Employee, LeaveApplication, Payroll
            from datetime import datetime, timedelta, date
            
            today = datetime.now().date()
            future_date = today + timedelta(days=days)
            
            # Upcoming leave approvals
            pending_leaves = db.query(LeaveApplication).filter(
                LeaveApplication.organization_id == organization_id,
                LeaveApplication.status == "pending",
                LeaveApplication.start_date >= today,
                LeaveApplication.start_date <= future_date,
                LeaveApplication.deleted_at == None,
            ).limit(20).all()
            
            for leave in pending_leaves:
                employee = db.query(Employee).filter(Employee.id == leave.employee_id).first()
                if employee:
                    tasks.append({
                        "type": "leave_approval",
                        "priority": "medium",
                        "title": f"Leave approval: {employee.first_name} {employee.last_name}",
                        "due_date": leave.start_date.isoformat() if hasattr(leave, 'start_date') else today.isoformat(),
                        "action": "approve_leave",
                        "entity_id": leave.id,
                    })
            
            # Upcoming payroll
            if today.day <= 5:
                tasks.append({
                    "type": "payroll",
                    "priority": "high",
                    "title": "Monthly payroll processing",
                    "due_date": today.isoformat(),
                    "action": "process_payroll",
                })
        
        except Exception:
            pass
        finally:
            if db:
                db.close()
        
        return tasks
    
    def send_proactive_notification(
        self,
        task: ProactiveTask,
        recipient_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Send a proactive notification"""
        db = self.db_session_factory() if self.db_session_factory else None
        
        if not db:
            return {"success": False, "error": "Database not available"}
        
        try:
            from models import Employee, Notification, User
            
            recipient_user_id = recipient_id
            if not recipient_user_id and task.employee_id:
                employee = db.query(Employee).filter(Employee.id == task.employee_id).first()
                if employee and employee.user_id:
                    recipient_user_id = employee.user_id
            
            if not recipient_user_id:
                return {"success": False, "error": "Recipient not found"}
            
            notification = Notification(
                user_id=recipient_user_id,
                organization_id=task.organization_id,
                company_id=task.company_id,
                title=task.description,
                message=task.description,
                notification_type="proactive_hr",
                metadata={
                    "task_type": task.task_type.value,
                    "task_id": task.task_id,
                    "actions": task.actions,
                },
            )
            db.add(notification)
            db.commit()
            
            self.audit.log_action(
                user_id="system",
                action="send_proactive_notification",
                parameters={"task_type": task.task_type.value, "employee_id": task.employee_id},
                result={"success": True, "notification_id": notification.id},
                organization_id=task.organization_id,
            )
            
            return {"success": True, "notification_id": notification.id}
        except Exception as e:
            if db:
                db.rollback()
            return {"success": False, "error": str(e)}
        finally:
            if db:
                db.close()


class AutonomousHRManager:
    """
    Autonomous HR Manager that can run HR operations for small companies
    without dedicated HR staff. Acts as a complete virtual HR department.
    """
    
    def __init__(self, db_session_factory=None):
        self.db_session_factory = db_session_factory
        self.policy_engine = CompanyPolicyEngine(db_session_factory)
        self.auto_approval = AutoApprovalEngine(self.policy_engine)
        self.proactive = ProactiveAssistant(db_session_factory, self.policy_engine)
        self.audit = get_ai_audit_logger()
        self.email_engine = get_email_template_engine()
        self.document_generator = get_document_generator()
    
    def process_leave_request(
        self,
        employee_id: int,
        leave_type_id: int,
        start_date: date,
        end_date: date,
        reason: str = "",
        organization_id: Optional[int] = None,
        company_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Process a leave request autonomously.
        Auto-approves if within policy, otherwise routes for approval.
        """
        db = self.db_session_factory() if self.db_session_factory else None
        if not db:
            return {"success": False, "error": "Database not available"}
        
        try:
            from models import Employee, LeaveApplication, LeaveBalance
            
            employee = db.query(Employee).filter(Employee.id == employee_id).first()
            if not employee:
                return {"success": False, "error": "Employee not found"}
            
            org_id = organization_id or employee.organization_id
            comp_id = company_id or employee.company_id
            
            total_days = (end_date - start_date).days + 1
            
            # Check leave balance
            balance = db.query(LeaveBalance).filter(
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.leave_type_id == leave_type_id,
                LeaveBalance.deleted_at == None,
            ).first()
            
            if balance and (balance.remaining_days or 0) < total_days:
                return {
                    "success": False,
                    "error": "insufficient_balance",
                    "message": f"Insufficient leave balance. Required: {total_days} days, Available: {balance.remaining_days or 0} days.",
                }
            
            # Evaluate auto-approval
            status, reason, approver = self.auto_approval.evaluate_leave_request(
                employee_id, leave_type_id, start_date, end_date, total_days, org_id, comp_id
            )
            
            leave_status = "pending"
            approver_id = None
            
            if status == AutoApprovalStatus.AUTO_APPROVED:
                leave_status = "approved"
                approver_id = employee.user_id
            elif status == AutoApprovalStatus.NEEDS_APPROVAL:
                # Find manager
                if employee.reporting_manager_id:
                    approver_id = employee.reporting_manager_id
            
            # Create leave application
            leave = LeaveApplication(
                employee_id=employee_id,
                leave_type_id=leave_type_id,
                organization_id=org_id,
                company_id=comp_id,
                department_id=employee.department_id,
                start_date=start_date,
                end_date=end_date,
                total_days=total_days,
                reason=reason,
                status=leave_status,
                approver_id=approver_id,
                request_source="ai_autonomous",
            )
            db.add(leave)
            
            # Update balance
            if balance:
                balance.used_days = (balance.used_days or 0) + total_days
                balance.remaining_days = (balance.remaining_days or 0) - total_days
            
            db.commit()
            db.refresh(leave)
            
            # Send notification
            if leave_status == "approved":
                self._send_leave_approval_notification(leave, employee, db)
            elif approver_id:
                self._send_leave_approval_request(leave, employee, approver_id, db)
            
            self.audit.log_action(
                user_id=str(employee_id),
                action="autonomous_leave_process",
                parameters={
                    "employee_id": employee_id,
                    "leave_type_id": leave_type_id,
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "total_days": total_days,
                },
                result={"success": True, "leave_id": leave.id, "status": leave_status},
                organization_id=org_id,
            )
            
            return {
                "success": True,
                "leave_id": leave.id,
                "status": leave_status,
                "message": f"Leave request processed: {leave_status}. {reason}",
            }
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e), "message": f"Failed to process leave: {str(e)}"}
        finally:
            if db:
                db.close()
    
    def process_attendance_correction(
        self,
        employee_id: int,
        date: date,
        correct_status: str,
        reason: str,
        organization_id: Optional[int] = None,
        company_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Process attendance correction autonomously"""
        db = self.db_session_factory() if self.db_session_factory else None
        if not db:
            return {"success": False, "error": "Database not available"}
        
        try:
            from models import Employee, Attendance
            
            employee = db.query(Employee).filter(Employee.id == employee_id).first()
            if not employee:
                return {"success": False, "error": "Employee not found"}
            
            org_id = organization_id or employee.organization_id
            comp_id = company_id or employee.company_id
            
            status, reason_text, approver = self.auto_approval.evaluate_attendance_correction(
                employee_id, "status_change", org_id, comp_id
            )
            
            attendance = db.query(Attendance).filter(
                Attendance.employee_id == employee_id,
                Attendance.date == date,
                Attendance.organization_id == org_id,
            ).first()
            
            if attendance:
                attendance.status = correct_status
                attendance.updated_at = datetime.now()
            else:
                attendance = Attendance(
                    employee_id=employee_id,
                    organization_id=org_id,
                    company_id=comp_id,
                    department_id=employee.department_id,
                    date=date,
                    status=correct_status,
                    is_manual_entry=True,
                )
                db.add(attendance)
            
            db.commit()
            
            self.audit.log_action(
                user_id=str(employee_id),
                action="autonomous_attendance_correction",
                parameters={
                    "employee_id": employee_id,
                    "date": date.isoformat(),
                    "correct_status": correct_status,
                    "reason": reason,
                },
                result={"success": True, "status": status.value},
                organization_id=org_id,
            )
            
            return {
                "success": True,
                "status": status.value,
                "message": f"Attendance correction {status.value}: {reason_text}",
            }
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}
        finally:
            if db:
                db.close()
    
    def run_daily_hr_checks(self, organization_id: int, company_id: Optional[int] = None) -> Dict[str, Any]:
        """Run daily HR checks and take autonomous actions"""
        results = {
            "tasks_generated": 0,
            "tasks_completed": 0,
            "notifications_sent": 0,
            "escalations_created": 0,
            "actions": [],
        }
        
        tasks = self.proactive.generate_daily_tasks(organization_id, company_id)
        results["tasks_generated"] = len(tasks)
        
        for task in tasks:
            try:
                if task["type"] == "leave_approval_pending":
                    result = self._handle_pending_leave(task, organization_id, company_id)
                    results["actions"].append(result)
                
                elif task["type"] == "attendance_anomaly":
                    result = self._handle_attendance_anomaly(task, organization_id, company_id)
                    results["actions"].append(result)
                
                elif task["type"] == "probation_ending":
                    result = self._handle_probation_ending(task, organization_id, company_id)
                    results["actions"].append(result)
                
                elif task["type"] == "birthday":
                    result = self._handle_birthday(task, organization_id, company_id)
                    results["actions"].append(result)
                
                elif task["type"] == "work_anniversary":
                    result = self._handle_anniversary(task, organization_id, company_id)
                    results["actions"].append(result)
                
                results["tasks_completed"] += 1
            except Exception as e:
                results["actions"].append({"task": task, "error": str(e)})
        
        return results
    
    def _handle_pending_leave(self, task: Dict, organization_id: int, company_id: Optional[int]) -> Dict[str, Any]:
        db = self.db_session_factory() if self.db_session_factory else None
        if not db:
            return {"error": "No database"}
        
        try:
            from models import LeaveApplication, Employee
            
            leave = db.query(LeaveApplication).filter(LeaveApplication.id == task["entity_id"]).first()
            if not leave:
                return {"error": "Leave not found"}
            
            employee = db.query(Employee).filter(Employee.id == task["employee_id"]).first()
            if not employee:
                return {"error": "Employee not found"}
            
            # Check if manager approved
            if leave.approver_id:
                approver = db.query(Employee).filter(Employee.id == leave.approver_id).first()
                if approver:
                    notification = self.proactive.send_proactive_notification(
                        ProactiveTask(
                            task_id=f"notif_{leave.id}",
                            task_type=ProactiveTaskType.LEAVE_REMINDER,
                            employee_id=leave.employee_id,
                            organization_id=organization_id,
                            company_id=company_id,
                            scheduled_date=datetime.now().isoformat(),
                            description=f"Reminder: Leave approval needed for {employee.first_name} {employee.last_name}",
                            actions=[{"action": "notify", "approver_id": leave.approver_id}],
                        ),
                        recipient_id=leave.approver_id,
                    )
                    return {"action": "notified_approver", "leave_id": leave.id, "notification": notification}
            
            return {"action": "no_approver_assigned", "leave_id": leave.id}
        except Exception as e:
            return {"error": str(e)}
        finally:
            if db:
                db.close()
    
    def _handle_attendance_anomaly(self, task: Dict, organization_id: int, company_id: Optional[int]) -> Dict[str, Any]:
        return {"action": "attendance_anomaly_noted", "description": task["description"]}
    
    def _handle_probation_ending(self, task: Dict, organization_id: int, company_id: Optional[int]) -> Dict[str, Any]:
        db = self.db_session_factory() if self.db_session_factory else None
        if not db:
            return {"error": "No database"}
        
        try:
            from models import Employee
            
            employee = db.query(Employee).filter(Employee.id == task["employee_id"]).first()
            if not employee:
                return {"error": "Employee not found"}
            
            context = {
                "employee_name": f"{employee.first_name or ''} {employee.last_name or ''}".strip(),
                "employee_code": employee.employee_code,
                "designation": employee.designation,
                "department": getattr(employee, 'department', {}).get('name', 'N/A') if hasattr(employee, 'department') else 'N/A',
                "probation_end_date": task.get("due_date", datetime.now().date().isoformat()),
                "confirmation_date": datetime.now().date().isoformat(),
            }
            
            doc = self.document_generator.generate(DocumentType.PROBATION_COMPLETION, context)
            notification = self.proactive.send_proactive_notification(
                ProactiveTask(
                    task_id=f"prob_{task['employee_id']}",
                    task_type=ProactiveTaskType.PROBATION_END,
                    employee_id=task["employee_id"],
                    organization_id=organization_id,
                    company_id=company_id,
                    scheduled_date=datetime.now().isoformat(),
                    description=f"Probation ending for {context['employee_name']}",
                    actions=[{"action": "generate_document", "document": doc}],
                ),
                recipient_id=task.get("employee_id"),
            )
            
            return {"action": "probation_notification_sent", "employee_id": task["employee_id"], "document": doc}
        except Exception as e:
            return {"error": str(e)}
        finally:
            if db:
                db.close()
    
    def _handle_birthday(self, task: Dict, organization_id: int, company_id: Optional[int]) -> Dict[str, Any]:
        return {"action": "birthday_noted", "employee_id": task["employee_id"]}
    
    def _handle_anniversary(self, task: Dict, organization_id: int, company_id: Optional[int]) -> Dict[str, Any]:
        return {"action": "anniversary_noted", "employee_id": task["employee_id"]}
    
    def _send_leave_approval_notification(self, leave, employee, db):
        try:
            from models import Notification
            
            context = {
                "employee_name": f"{employee.first_name or ''} {employee.last_name or ''}".strip(),
                "employee_code": employee.employee_code,
                "leave_type": getattr(leave, 'leave_type', {}).get('name', 'Leave') if hasattr(leave, 'leave_type') else 'Leave',
                "start_date": leave.start_date.isoformat() if leave.start_date else "",
                "end_date": leave.end_date.isoformat() if leave.end_date else "",
                "total_days": leave.total_days,
                "approved_by": "HR System",
                "approval_date": datetime.now().date().isoformat(),
            }
            
            email_result = self.email_engine.generate(EmailType.LEAVE_APPROVAL, context)
            
            notification = Notification(
                user_id=employee.user_id,
                organization_id=leave.organization_id,
                company_id=leave.company_id,
                title=f"Leave Approved - {leave.total_days} days",
                message=email_result.get("body", "Your leave has been approved."),
                notification_type="leave_approved",
                metadata={"leave_id": leave.id, "email": email_result},
            )
            db.add(notification)
            db.commit()
        except Exception:
            pass
    
    def _send_leave_approval_request(self, leave, employee, approver_id, db):
        try:
            from models import Notification
            
            notification = Notification(
                user_id=approver_id,
                organization_id=leave.organization_id,
                company_id=leave.company_id,
                title=f"Leave Approval Request - {employee.first_name} {employee.last_name}",
                message=f"Leave request from {employee.first_name} {employee.last_name} for {leave.total_days} days ({leave.start_date} to {leave.end_date})",
                notification_type="leave_approval_request",
                metadata={"leave_id": leave.id, "employee_id": employee.id},
            )
            db.add(notification)
            db.commit()
        except Exception:
            pass
    
    def get_hr_dashboard(self, organization_id: int, company_id: Optional[int] = None) -> Dict[str, Any]:
        """Get HR dashboard data for autonomous operations"""
        db = self.db_session_factory() if self.db_session_factory else None
        if not db:
            return {"error": "Database not available"}
        
        try:
            from models import Employee, LeaveApplication, Attendance, Payroll, PerformanceReview
            
            dashboard = {
                "organization_id": organization_id,
                "company_id": company_id,
                "total_employees": 0,
                "active_employees": 0,
                "pending_leaves": 0,
                "pending_approvals": 0,
                "attendance_today": 0,
                "upcoming_tasks": [],
                "policies": {},
            }
            
            dashboard["total_employees"] = db.query(Employee).filter(
                Employee.organization_id == organization_id,
                Employee.deleted_at == None,
            ).count()
            
            dashboard["active_employees"] = db.query(Employee).filter(
                Employee.organization_id == organization_id,
                Employee.deleted_at == None,
                Employee.status == "active",
            ).count()
            
            dashboard["pending_leaves"] = db.query(LeaveApplication).filter(
                LeaveApplication.organization_id == organization_id,
                LeaveApplication.status == "pending",
                LeaveApplication.deleted_at == None,
            ).count()
            
            dashboard["policies"] = {
                "leave": self.policy_engine.get_leave_policy(organization_id, company_id),
                "attendance": self.policy_engine.get_attendance_policy(organization_id, company_id),
                "payroll": self.policy_engine.get_payroll_policy(organization_id, company_id),
            }
            
            dashboard["upcoming_tasks"] = self.proactive.get_upcoming_tasks(organization_id, days=7)
            
            return dashboard
        except Exception as e:
            return {"error": str(e)}
        finally:
            if db:
                db.close()


# Global instances
_policy_engine: Optional[CompanyPolicyEngine] = None
_auto_approval: Optional[AutoApprovalEngine] = None
_proactive: Optional[ProactiveAssistant] = None
_autonomous_hr: Optional[AutonomousHRManager] = None


def get_policy_engine() -> CompanyPolicyEngine:
    global _policy_engine
    if _policy_engine is None:
        _policy_engine = CompanyPolicyEngine()
    return _policy_engine


def get_auto_approval_engine() -> AutoApprovalEngine:
    global _auto_approval
    if _auto_approval is None:
        _auto_approval = AutoApprovalEngine(get_policy_engine())
    return _auto_approval


def get_proactive_assistant() -> ProactiveAssistant:
    global _proactive
    if _proactive is None:
        _proactive = ProactiveAssistant()
    return _proactive


def get_autonomous_hr_manager() -> AutonomousHRManager:
    global _autonomous_hr
    if _autonomous_hr is None:
        _autonomous_hr = AutonomousHRManager()
    return _autonomous_hr


def init_autonomous_hr(db_session_factory=None):
    global _policy_engine, _auto_approval, _proactive, _autonomous_hr
    _policy_engine = CompanyPolicyEngine(db_session_factory)
    _auto_approval = AutoApprovalEngine(_policy_engine)
    _proactive = ProactiveAssistant(db_session_factory, _policy_engine)
    _autonomous_hr = AutonomousHRManager(db_session_factory)
    return _autonomous_hr
