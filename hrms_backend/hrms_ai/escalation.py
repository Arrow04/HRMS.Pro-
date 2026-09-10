"""
HRMS AI Escalation System
Automatic and manual escalation to human HR representatives
"""
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from enum import Enum

from hrms_ai.exceptions import AIEscalationRequiredError


class EscalationPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EscalationStatus(str, Enum):
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    CLOSED = "closed"


class EscalationReason(str, Enum):
    LOW_CONFIDENCE = "low_confidence"
    PERMISSION_DENIED = "permission_denied"
    COMPLIANCE_ISSUE = "compliance_issue"
    SENSITIVE_REQUEST = "sensitive_request"
    ACTION_FAILED = "action_failed"
    USER_REQUESTED = "user_requested"
    MULTI_STEP_PROCESS = "multi_step_process"
    LEGAL_REQUIREMENT = "legal_requirement"
    SYSTEM_ERROR = "system_error"


# SLA targets by priority
SLA_TARGETS: Dict[EscalationPriority, timedelta] = {
    EscalationPriority.LOW: timedelta(hours=24),
    EscalationPriority.MEDIUM: timedelta(hours=4),
    EscalationPriority.HIGH: timedelta(hours=1),
    EscalationPriority.CRITICAL: timedelta(minutes=15),
}

# Role routing for escalations
ROUTING_RULES: Dict[EscalationReason, str] = {
    EscalationReason.LOW_CONFIDENCE: "hr_manager",
    EscalationReason.PERMISSION_DENIED: "hr_admin",
    EscalationReason.COMPLIANCE_ISSUE: "compliance_officer",
    EscalationReason.SENSITIVE_REQUEST: "hr_manager",
    EscalationReason.ACTION_FAILED: "hr_admin",
    EscalationReason.USER_REQUESTED: "hr_admin",
    EscalationReason.MULTI_STEP_PROCESS: "hr_manager",
    EscalationReason.LEGAL_REQUIREMENT: "compliance_officer",
    EscalationReason.SYSTEM_ERROR: "superadmin",
}


@dataclass
class Escalation:
    escalation_id: str
    conversation_id: str
    user_id: str
    organization_id: Optional[int]
    reason: EscalationReason
    priority: EscalationPriority
    status: EscalationStatus
    title: str
    description: str
    context: Dict[str, Any]
    assigned_to: Optional[str] = None
    assigned_to_role: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""
    sla_deadline: Optional[str] = None
    resolved_at: Optional[str] = None
    resolution: Optional[str] = None
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now().isoformat()
        if not self.updated_at:
            self.updated_at = self.created_at
        if not self.sla_deadline:
            sla = SLA_TARGETS[self.priority]
            self.sla_deadline = (datetime.now() + sla).isoformat()
        if self.metadata is None:
            self.metadata = {}


class EscalationManager:
    """Manages AI escalations to human representatives"""
    
    def __init__(self, db_session=None, notification_service=None):
        self.db_session = db_session
        self.notification_service = notification_service
        self._escalations: Dict[str, Escalation] = {}
        self._user_escalations: Dict[str, List[str]] = {}  # user_id -> [escalation_ids]
    
    def create_escalation(
        self,
        conversation_id: str,
        user_id: str,
        reason: EscalationReason,
        title: str,
        description: str,
        context: Dict[str, Any],
        organization_id: Optional[int] = None,
        priority: Optional[EscalationPriority] = None,
        assigned_to: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Escalation:
        """Create a new escalation"""
        escalation_id = str(uuid.uuid4())
        
        # Auto-determine priority if not specified
        if priority is None:
            priority = self._determine_priority(reason, context)
        
        # Auto-route if not assigned
        if not assigned_to:
            assigned_to_role = ROUTING_RULES.get(reason, "hr_admin")
            # In production, this would query the DB for available agents
            assigned_to = f"auto_{assigned_to_role}"
        else:
            assigned_to_role = None
        
        escalation = Escalation(
            escalation_id=escalation_id,
            conversation_id=conversation_id,
            user_id=user_id,
            organization_id=organization_id,
            reason=reason,
            priority=priority,
            status=EscalationStatus.ASSIGNED if assigned_to else EscalationStatus.PENDING,
            title=title,
            description=description,
            context=context,
            assigned_to=assigned_to,
            assigned_to_role=assigned_to_role,
            metadata=metadata or {},
        )
        
        # Store
        self._escalations[escalation_id] = escalation
        if user_id not in self._user_escalations:
            self._user_escalations[user_id] = []
        self._user_escalations[user_id].append(escalation_id)
        
        # Persist to DB
        if self.db_session:
            try:
                from models import AIEscalation
                db_escalation = AIEscalation(
                    id=escalation_id,
                    conversation_id=conversation_id,
                    user_id=user_id,
                    organization_id=organization_id,
                    reason=reason.value,
                    priority=priority.value,
                    status=escalation.status.value,
                    title=title,
                    description=description,
                    context=json.dumps(context, default=str),
                    assigned_to=assigned_to,
                    assigned_to_role=assigned_to_role,
                    sla_deadline=datetime.fromisoformat(escalation.sla_deadline),
                    meta_data=json.dumps(metadata or {}),
                )
                self.db_session.add(db_escalation)
                self.db_session.flush()
            except Exception:
                pass
        
        # Send notification
        if self.notification_service and assigned_to:
            try:
                self.notification_service.send_notification(
                    user_id=assigned_to,
                    title=f"AI Escalation: {title}",
                    message=f"Priority: {priority.value.upper()}\n\n{description}",
                    notification_type="ai_escalation",
                    metadata={"escalation_id": escalation_id},
                )
            except Exception:
                pass
        
        return escalation
    
    def _determine_priority(
        self,
        reason: EscalationReason,
        context: Dict[str, Any],
    ) -> EscalationPriority:
        """Auto-determine escalation priority based on reason and context"""
        if reason == EscalationReason.COMPLIANCE_ISSUE:
            return EscalationPriority.HIGH
        
        if reason == EscalationReason.LEGAL_REQUIREMENT:
            return EscalationPriority.CRITICAL
        
        if reason == EscalationReason.SENSITIVE_REQUEST:
            sensitive_keywords = ["harassment", "discrimination", "termination", "resignation", "salary dispute"]
            context_str = json.dumps(context, default=str).lower()
            if any(kw in context_str for kw in sensitive_keywords):
                return EscalationPriority.CRITICAL
            return EscalationPriority.HIGH
        
        if reason == EscalationReason.PERMISSION_DENIED:
            requested_action = context.get("action", "")
            sensitive_actions = ["salary", "terminate", "fire", "demote", "suspend", "legal"]
            if any(a in requested_action.lower() for a in sensitive_actions):
                return EscalationPriority.HIGH
        
        if reason == EscalationReason.LOW_CONFIDENCE:
            confidence = context.get("confidence", 1.0)
            if confidence < 0.3:
                return EscalationPriority.HIGH
            elif confidence < 0.6:
                return EscalationPriority.MEDIUM
        
        if reason == EscalationReason.SYSTEM_ERROR:
            return EscalationPriority.HIGH
        
        return EscalationPriority.MEDIUM
    
    def get_escalation(self, escalation_id: str) -> Optional[Escalation]:
        """Get an escalation by ID"""
        return self._escalations.get(escalation_id)
    
    def update_status(
        self,
        escalation_id: str,
        status: EscalationStatus,
        resolution: Optional[str] = None,
        resolved_by: Optional[str] = None,
    ) -> Optional[Escalation]:
        """Update escalation status"""
        escalation = self._escalations.get(escalation_id)
        if not escalation:
            return None
        
        escalation.status = status
        escalation.updated_at = datetime.now().isoformat()
        
        if status == EscalationStatus.RESOLVED:
            escalation.resolved_at = escalation.updated_at
            escalation.resolution = resolution
        
        # Update DB
        if self.db_session:
            try:
                from models import AIEscalation
                db_esc = self.db_session.query(AIEscalation).filter_by(id=escalation_id).first()
                if db_esc:
                    db_esc.status = status.value
                    db_esc.updated_at = datetime.now()
                    if resolution:
                        db_esc.resolution = resolution
                    if resolved_by:
                        db_esc.resolved_by = resolved_by
                    if status == EscalationStatus.RESOLVED:
                        db_esc.resolved_at = datetime.now()
                    self.db_session.flush()
            except Exception:
                pass
        
        return escalation
    
    def get_user_escalations(self, user_id: str) -> List[Escalation]:
        """Get all escalations for a user"""
        escalation_ids = self._user_escalations.get(user_id, [])
        return [self._escalations[eid] for eid in escalation_ids if eid in self._escalations]
    
    def get_pending_escalations(
        self,
        organization_id: Optional[int] = None,
        priority: Optional[EscalationPriority] = None,
        assigned_to: Optional[str] = None,
    ) -> List[Escalation]:
        """Get pending escalations with filters"""
        escalations = list(self._escalations.values())
        
        pending_statuses = {
            EscalationStatus.PENDING,
            EscalationStatus.ASSIGNED,
            EscalationStatus.IN_PROGRESS,
        }
        
        escalations = [e for e in escalations if e.status in pending_statuses]
        
        if organization_id:
            escalations = [e for e in escalations if e.organization_id == organization_id]
        if priority:
            escalations = [e for e in escalations if e.priority == priority]
        if assigned_to:
            escalations = [e for e in escalations if e.assigned_to == assigned_to]
        
        # Sort by priority then by created_at
        priority_order = {
            EscalationPriority.CRITICAL: 0,
            EscalationPriority.HIGH: 1,
            EscalationPriority.MEDIUM: 2,
            EscalationPriority.LOW: 3,
        }
        escalations.sort(key=lambda e: (priority_order.get(e.priority, 2), e.created_at))
        
        return escalations
    
    def get_sla_violations(self) -> List[Escalation]:
        """Get escalations that have violated SLA"""
        now = datetime.now()
        violations = []
        
        for escalation in self._escalations.values():
            if escalation.status in {EscalationStatus.RESOLVED, EscalationStatus.CLOSED}:
                continue
            
            if escalation.sla_deadline:
                deadline = datetime.fromisoformat(escalation.sla_deadline)
                if now > deadline:
                    violations.append(escalation)
        
        return violations
    
    def should_escalate(
        self,
        confidence: float,
        action: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, Optional[EscalationReason], Optional[str]]:
        """
        Determine if a request should be escalated
        Returns: (should_escalate, reason, description)
        """
        context = context or {}
        
        # Low confidence
        if confidence < 0.4:
            return True, EscalationReason.LOW_CONFIDENCE, "AI confidence too low for automated response"
        
        # Sensitive actions
        sensitive_actions = [
            "terminate_employee", "fire_employee", "suspend_employee",
            "change_salary", "process_termination", "legal_action",
            "harassment_complaint", "discrimination_report",
        ]
        if action and any(sa in action.lower() for sa in sensitive_actions):
            return True, EscalationReason.SENSITIVE_REQUEST, f"Sensitive action requires human review: {action}"
        
        # Compliance-related
        compliance_keywords = ["legal", "compliance", "audit", "regulatory", "government", "statutory"]
        query = context.get("query", "") or context.get("message", "")
        if any(kw in query.lower() for kw in compliance_keywords):
            return True, EscalationReason.COMPLIANCE_ISSUE, "Query involves compliance or legal matters"
        
        # Multi-step processes
        complex_processes = ["offboarding", "exit_management", "full_and_final", "retrenchment"]
        if action and any(cp in action.lower() for cp in complex_processes):
            return True, EscalationReason.MULTI_STEP_PROCESS, f"Complex process requires human coordination: {action}"
        
        return False, None, None
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get escalation statistics"""
        total = len(self._escalations)
        by_status = {}
        by_priority = {}
        by_reason = {}
        
        for esc in self._escalations.values():
            by_status[esc.status.value] = by_status.get(esc.status.value, 0) + 1
            by_priority[esc.priority.value] = by_priority.get(esc.priority.value, 0) + 1
            by_reason[esc.reason.value] = by_reason.get(esc.reason.value, 0) + 1
        
        violations = len(self.get_sla_violations())
        
        return {
            "total_escalations": total,
            "by_status": by_status,
            "by_priority": by_priority,
            "by_reason": by_reason,
            "sla_violations": violations,
            "sla_compliance_rate": (total - violations) / max(total, 1),
        }


# Global escalation manager
_escalation_manager: Optional[EscalationManager] = None


def get_escalation_manager() -> EscalationManager:
    """Get the global escalation manager"""
    global _escalation_manager
    if _escalation_manager is None:
        _escalation_manager = EscalationManager()
    return _escalation_manager


def init_escalation_manager(db_session=None, notification_service=None) -> EscalationManager:
    """Initialize the global escalation manager"""
    global _escalation_manager
    _escalation_manager = EscalationManager(
        db_session=db_session,
        notification_service=notification_service,
    )
    return _escalation_manager
