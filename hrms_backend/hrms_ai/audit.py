"""
HRMS AI Audit Logging
Comprehensive audit trail for all AI interactions and actions
"""
import json
import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field, asdict
from enum import Enum

from hrms_ai.exceptions import HRMSAIException


class AuditEventType(str, Enum):
    CHAT_MESSAGE = "chat_message"
    AI_ACTION = "ai_action"
    ACTION_EXECUTED = "action_executed"
    ACTION_FAILED = "action_failed"
    ESCALATION_CREATED = "escalation_created"
    ESCALATION_RESOLVED = "escalation_resolved"
    KNOWLEDGE_QUERY = "knowledge_query"
    PERMISSION_DENIED = "permission_denied"
    TENANT_VIOLATION = "tenant_violation"
    PROVIDER_ERROR = "provider_error"
    SYSTEM_ERROR = "system_error"


class AuditSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class AIAuditLog:
    audit_id: str
    event_type: AuditEventType
    user_id: str
    organization_id: Optional[int]
    timestamp: str
    severity: AuditSeverity = AuditSeverity.INFO
    message: str = ""
    details: Dict[str, Any] = field(default_factory=dict)
    conversation_id: Optional[str] = None
    action_id: Optional[str] = None
    provider: Optional[str] = None
    latency_ms: Optional[int] = None
    tokens_used: Optional[int] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class AIAuditLogger:
    """Audit logger for HRMS AI operations"""
    
    def __init__(self, db_session=None, redis_client=None):
        self.db_session = db_session
        self.redis_client = redis_client
        self._logs: List[AIAuditLog] = []
        self._max_memory_logs = 1000
    
    def log(
        self,
        event_type: AuditEventType,
        user_id: str,
        message: str,
        organization_id: Optional[int] = None,
        severity: AuditSeverity = AuditSeverity.INFO,
        details: Optional[Dict[str, Any]] = None,
        conversation_id: Optional[str] = None,
        action_id: Optional[str] = None,
        provider: Optional[str] = None,
        latency_ms: Optional[int] = None,
        tokens_used: Optional[int] = None,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AIAuditLog:
        """Create and store an audit log entry"""
        audit_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()
        
        log_entry = AIAuditLog(
            audit_id=audit_id,
            event_type=event_type,
            user_id=user_id,
            organization_id=organization_id,
            timestamp=timestamp,
            severity=severity,
            message=message,
            details=details or {},
            conversation_id=conversation_id,
            action_id=action_id,
            provider=provider,
            latency_ms=latency_ms,
            tokens_used=tokens_used,
            error=error,
            metadata=metadata or {},
        )
        
        # Store in memory
        self._logs.append(log_entry)
        if len(self._logs) > self._max_memory_logs:
            self._logs.pop(0)
        
        # Persist to Redis if available (for streaming to external systems)
        if self.redis_client:
            try:
                key = f"hrms_ai:audit:{audit_id}"
                self.redis_client.setex(
                    key,
                    86400 * 7,  # 7 days retention
                    json.dumps(asdict(log_entry), default=str)
                )
            except Exception:
                pass  # Non-critical
        
        # Persist to database if available
        if self.db_session:
            try:
                from models import AIAuditLog as DBAuditLog
                db_log = DBAuditLog(
                    id=audit_id,
                    event_type=event_type.value,
                    user_id=user_id,
                    organization_id=organization_id,
                    timestamp=datetime.fromisoformat(timestamp),
                    severity=severity.value,
                    message=message,
                    details=json.dumps(details or {}),
                    conversation_id=conversation_id,
                    action_id=action_id,
                    provider=provider,
                    latency_ms=latency_ms,
                    tokens_used=tokens_used,
                    error=error,
                    meta_data=json.dumps(metadata or {}),
                )
                self.db_session.add(db_log)
                self.db_session.flush()
            except Exception:
                pass  # Non-critical, don't break AI flow
        
        return log_entry
    
    def log_chat(
        self,
        user_id: str,
        message: str,
        response: str,
        intent: str,
        confidence: float,
        organization_id: Optional[int] = None,
        conversation_id: Optional[str] = None,
        provider: Optional[str] = None,
        latency_ms: Optional[int] = None,
    ):
        """Log a chat interaction"""
        self.log(
            event_type=AuditEventType.CHAT_MESSAGE,
            user_id=user_id,
            message=f"User: {message[:100]}... | Intent: {intent} | Confidence: {confidence:.2f}",
            organization_id=organization_id,
            severity=AuditSeverity.INFO,
            details={
                "user_message": message,
                "ai_response": response,
                "intent": intent,
                "confidence": confidence,
            },
            conversation_id=conversation_id,
            provider=provider,
            latency_ms=latency_ms,
        )
    
    def log_action(
        self,
        user_id: str,
        action: str,
        parameters: Dict[str, Any],
        result: Dict[str, Any],
        organization_id: Optional[int] = None,
        conversation_id: Optional[str] = None,
        action_id: Optional[str] = None,
        success: bool = True,
        error: Optional[str] = None,
        latency_ms: Optional[int] = None,
    ):
        """Log an action execution"""
        event_type = AuditEventType.ACTION_EXECUTED if success else AuditEventType.ACTION_FAILED
        severity = AuditSeverity.INFO if success else AuditSeverity.ERROR
        
        self.log(
            event_type=event_type,
            user_id=user_id,
            message=f"Action: {action} | Status: {'Success' if success else 'Failed'}",
            organization_id=organization_id,
            severity=severity,
            details={
                "action": action,
                "parameters": parameters,
                "result": result,
                "success": success,
            },
            conversation_id=conversation_id,
            action_id=action_id,
            error=error,
            latency_ms=latency_ms,
        )
    
    def log_escalation(
        self,
        user_id: str,
        reason: str,
        priority: str,
        organization_id: Optional[int] = None,
        conversation_id: Optional[str] = None,
        assigned_to: Optional[str] = None,
    ):
        """Log an escalation event"""
        self.log(
            event_type=AuditEventType.ESCALATION_CREATED,
            user_id=user_id,
            message=f"Escalation created: {reason} | Priority: {priority}",
            organization_id=organization_id,
            severity=AuditSeverity.WARNING,
            details={
                "reason": reason,
                "priority": priority,
                "assigned_to": assigned_to,
            },
            conversation_id=conversation_id,
        )
    
    def log_permission_denied(
        self,
        user_id: str,
        action: str,
        reason: str,
        organization_id: Optional[int] = None,
        conversation_id: Optional[str] = None,
    ):
        """Log a permission denied event"""
        self.log(
            event_type=AuditEventType.PERMISSION_DENIED,
            user_id=user_id,
            message=f"Permission denied: {action} | Reason: {reason}",
            organization_id=organization_id,
            severity=AuditSeverity.WARNING,
            details={
                "action": action,
                "reason": reason,
            },
            conversation_id=conversation_id,
        )
    
    def log_error(
        self,
        user_id: str,
        error_type: str,
        error_message: str,
        organization_id: Optional[int] = None,
        conversation_id: Optional[str] = None,
        provider: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Log an error event"""
        event_type_map = {
            "provider": AuditEventType.PROVIDER_ERROR,
            "tenant": AuditEventType.TENANT_VIOLATION,
            "knowledge": AuditEventType.KNOWLEDGE_QUERY,
        }
        event_type = event_type_map.get(error_type, AuditEventType.SYSTEM_ERROR)
        
        self.log(
            event_type=event_type,
            user_id=user_id,
            message=f"Error: {error_message}",
            organization_id=organization_id,
            severity=AuditSeverity.ERROR,
            error=error_message,
            provider=provider,
            metadata=metadata or {},
            conversation_id=conversation_id,
        )
    
    def get_logs(
        self,
        user_id: Optional[str] = None,
        organization_id: Optional[int] = None,
        event_type: Optional[AuditEventType] = None,
        limit: int = 100,
    ) -> List[AIAuditLog]:
        """Retrieve audit logs with filtering"""
        logs = self._logs
        
        if user_id:
            logs = [l for l in logs if l.user_id == user_id]
        if organization_id:
            logs = [l for l in logs if l.organization_id == organization_id]
        if event_type:
            logs = [l for l in logs if l.event_type == event_type]
        
        return logs[-limit:]
    
    def get_statistics(self, organization_id: Optional[int] = None) -> Dict[str, Any]:
        """Get audit statistics"""
        logs = self._logs
        if organization_id:
            logs = [l for l in logs if l.organization_id == organization_id]
        
        total = len(logs)
        by_type = {}
        by_severity = {}
        
        for log in logs:
            by_type[log.event_type.value] = by_type.get(log.event_type.value, 0) + 1
            by_severity[log.severity.value] = by_severity.get(log.severity.value, 0) + 1
        
        return {
            "total_events": total,
            "by_type": by_type,
            "by_severity": by_severity,
            "error_rate": by_severity.get("error", 0) / max(total, 1),
            "escalation_count": by_type.get("escalation_created", 0),
        }


# Global audit logger instance
_ai_audit_logger: Optional[AIAuditLogger] = None


def get_ai_audit_logger() -> AIAuditLogger:
    """Get the global AI audit logger"""
    global _ai_audit_logger
    if _ai_audit_logger is None:
        _ai_audit_logger = AIAuditLogger()
    return _ai_audit_logger


def init_ai_audit_logger(db_session=None, redis_client=None):
    """Initialize the global AI audit logger with dependencies"""
    global _ai_audit_logger
    _ai_audit_logger = AIAuditLogger(db_session=db_session, redis_client=redis_client)
    return _ai_audit_logger
