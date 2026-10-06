"""
HRMS AI Engine
Main orchestration layer - fully local, no external APIs
"""
import json
import time
from typing import Optional, Dict, Any, List
from datetime import datetime

from hrms_ai.schemas import AIContext, AIChatRequest, AIChatResponse, AIActionRequest, AIActionResponse
from hrms_ai.exceptions import (
    AIProviderUnavailableError,
    AIContextError,
    AIEscalationRequiredError,
)
from hrms_ai.audit import get_ai_audit_logger, AuditEventType, AuditSeverity
from hrms_ai.context import AIContextBuilder
from hrms_ai.actions import AIActionExecutor
from hrms_ai.escalation import get_escalation_manager, EscalationReason, EscalationPriority
from hrms_ai.knowledge import get_knowledge_base
from hrms_ai.prompts import (
    ACTION_EXECUTION_PROMPT,
    ESCALATION_PROMPT,
    RAG_RETRIEVAL_PROMPT,
    build_system_prompt,
)
from hrms_ai.nlp import get_nlp_engine
from hrms_ai.provider import LocalInferenceProvider, LLMResponse
from hrms_ai.retrieval import get_retrieval_engine


class HRMSAIEngine:
    """
    Enterprise HRMS AI Engine - Fully Local
    Orchestrates context building, knowledge retrieval, action execution, and escalation
    No external API dependencies
    """
    
    def __init__(
        self,
        db_session_factory=None,
        llm_provider=None,
        notification_service=None,
    ):
        self.db_session_factory = db_session_factory
        self.llm_provider = llm_provider or LocalInferenceProvider()
        self.notification_service = notification_service
        
        # Initialize components
        self.context_builder = AIContextBuilder(db_session_factory)
        self.action_executor = AIActionExecutor(db_session_factory)
        self.knowledge_base = get_knowledge_base()
        self.audit = get_ai_audit_logger()
        self.escalation_manager = get_escalation_manager()
        self.nlp_engine = get_nlp_engine()
        self.retrieval_engine = get_retrieval_engine()
        
        # Conversation store
        self._conversations: Dict[str, List[Dict[str, Any]]] = {}
    
    def _get_conversation(self, conversation_id: str) -> List[Dict[str, Any]]:
        """Get or create conversation history"""
        if conversation_id not in self._conversations:
            self._conversations[conversation_id] = []
        return self._conversations[conversation_id]
    
    async def chat(
        self, 
        request: AIChatRequest, 
        db_session=None
    ) -> AIChatResponse:
        """
        Main chat interface for HRMS AI - Fully local
        1. Build context
        2. Retrieve relevant knowledge
        3. Determine intent and extract actions
        4. Execute action or generate response
        5. Check if escalation needed
        """
        start_time = time.time()
        conversation_id = request.conversation_id or f"conv_{request.user_id}_{int(time.time())}"
        conversation = self._get_conversation(conversation_id)
        
        # Build context - pass db_session for request-scoped DB access
        context = await self.context_builder.build_context(
            user_id=request.user_id,
            organization_id=request.context.get("organization_id"),
            company_id=request.context.get("company_id"),
            role=request.context.get("role"),
            employee_id=request.context.get("employee_id"),
            department_id=request.context.get("department_id"),
            designation=request.context.get("designation"),
            conversation_history=conversation,
            query=request.message,
            db_session=db_session,
        )
        
        # Add user message to history
        conversation.append({
            "role": "user",
            "content": request.message,
            "timestamp": datetime.now().isoformat(),
        })
        
        # Classify intent and extract entities
        intent, confidence = self.nlp_engine.classify_intent(request.message)
        entities = self.nlp_engine.extract_entities(request.message)
        
        # Extract action parameters
        action_tuple = self.nlp_engine.extract_action_parameters(
            request.message, intent, entities, context
        )
        
        actions_taken = []
        response_text = None

        # ── 1) Data-grounded analyst FIRST ─────────────────────────────
        # Knowledge / how-to / live-figure questions must never be swallowed
        # by the action pipeline ("how do I run payroll?" is a guide, not a
        # payroll lookup). Analyst answers win at >= 0.75 confidence.
        analyst_out = None
        try:
            from hrms_ai.analyst import get_analyst
            analyst_out = get_analyst().answer(request.message, context, db_session)
        except Exception:
            analyst_out = None
        if analyst_out and float(analyst_out.get("confidence") or 0) >= 0.75:
            response_text = analyst_out["text"]
            intent = analyst_out.get("intent") or intent
            confidence = max(confidence, float(analyst_out.get("confidence") or 0))

        # ── 2) Mutating actions (leave apply etc.) — only when the analyst
        # had nothing grounded to say ────────────────────────────────────
        if not response_text and action_tuple:
            action_name, action_params = action_tuple
            action_result = self.action_executor.execute(
                action=action_name,
                parameters=action_params,
                context=context,
                db_session=db_session,  # Pass request DB session
            )
            actions_taken.append({
                "action": action_name,
                "parameters": action_params,
                "result": action_result,
            })

            if action_result.get("success"):
                response_text = action_result.get("message")
            else:
                response_text = action_result.get("message")

        # ── 3) Conversational fallback ──────────────────────────────────
        if not response_text:
            # Get relevant knowledge
            tenant_id = str(context.organization_id) if context.organization_id else "default"
            relevant_docs = self.retrieval_engine.retrieve(tenant_id, request.message, max_results=3)
            
            # Generate response using local NLP engine
            ai_context = {
                'user_id': context.user_id,
                'employee_id': context.employee_id,
                'organization_id': context.organization_id,
                'company_id': context.company_id,
                'role': context.role,
                'department_id': context.department_id,
                'designation': context.designation,
                'permissions': context.permissions,
                'industry': context.industry,
                'country': context.country,
                'conversation_history': conversation,
                'recent_actions': [a['action'] for a in actions_taken],
            }
            
            llm_response: LLMResponse = await self.llm_provider.generate(
                prompt=request.message,
                system_prompt=self.nlp_engine.get_system_prompt(context),
                temperature=0.7,
                max_tokens=1024,
                context=ai_context,
            )
            
            response_text = llm_response.text
        
        # Add assistant response to history
        conversation.append({
            "role": "assistant",
            "content": response_text,
            "timestamp": datetime.now().isoformat(),
            "intent": intent,
            "confidence": confidence,
            "actions": actions_taken,
        })
        
        # Trim conversation if too long
        if len(conversation) > 50:
            conversation[:] = conversation[-50:]
        
        # Generate suggestions
        suggestions = self.nlp_engine.get_suggestions(intent, context)
        
        # Check if escalation is needed
        escalation_info = None
        if request.escalate_if_needed:
            should_esc, esc_reason, esc_desc = self.escalation_manager.should_escalate(
                confidence=confidence,
                context={"query": request.message, "intent": intent},
            )
            if should_esc:
                escalation = self.escalation_manager.create_escalation(
                    conversation_id=conversation_id,
                    user_id=request.user_id,
                    reason=esc_reason,
                    title=f"AI Escalation: {intent}",
                    description=esc_desc,
                    context={
                        "query": request.message,
                        "intent": intent,
                        "confidence": confidence,
                        "user_role": context.role,
                    },
                    organization_id=context.organization_id,
                )
                escalation_info = {
                    "escalation_id": escalation.escalation_id,
                    "reason": esc_reason.value,
                    "status": escalation.status.value,
                }
                self.audit.log_escalation(
                    user_id=request.user_id,
                    reason=esc_reason.value,
                    priority="medium",
                    organization_id=context.organization_id,
                    conversation_id=conversation_id,
                )
        
        # Calculate latency
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Audit log
        self.audit.log_chat(
            user_id=request.user_id,
            message=request.message,
            response=response_text,
            intent=intent,
            confidence=confidence,
            organization_id=context.organization_id,
            conversation_id=conversation_id,
            provider="local_hrms_ai",
            latency_ms=latency_ms,
        )
        
        return AIChatResponse(
            conversation_id=conversation_id,
            response=response_text,
            intent=intent,
            confidence=confidence,
            actions_taken=actions_taken,
            suggestions=suggestions,
            escalation=escalation_info,
            timestamp=datetime.now().isoformat(),
            provider="local_hrms_ai",
            context={
                "user_id": context.user_id,
                "employee_id": context.employee_id,
                "organization_id": context.organization_id,
                "role": context.role,
                "intent": intent,
                "confidence": confidence,
            },
        )
    
    async def execute_action(
        self, 
        request: AIActionRequest, 
        db_session=None
    ) -> AIActionResponse:
        """Execute an AI action directly"""
        start_time = time.time()
        
        # Build context
        context = await self.context_builder.build_context(
            user_id=request.user_id,
            organization_id=request.context.get("organization_id"),
            company_id=request.context.get("company_id"),
            role=request.context.get("role"),
            employee_id=request.context.get("employee_id"),
            department_id=request.context.get("department_id"),
            designation=request.context.get("designation"),
            db_session=db_session,
        )
        
        # Execute action with request DB session
        result = self.action_executor.execute(
            action=request.action,
            parameters=request.parameters,
            context=context,
            db_session=db_session,
        )
        
        latency_ms = int((time.time() - start_time) * 1000)
        audit_id = f"act_{int(time.time())}_{request.user_id}"
        
        return AIActionResponse(
            success=result.get("success", False),
            action=request.action,
            result=result.get("data"),
            message=result.get("message", ""),
            timestamp=datetime.now().isoformat(),
            audit_id=audit_id,
        )
    
    async def index_tenant_data(self, tenant_id: str, db_session) -> Dict[str, Any]:
        """Index tenant data for local retrieval"""
        results = {
            "policies_indexed": 0,
            "documents_indexed": 0,
            "schema_indexed": False,
        }
        
        try:
            policies = self._extract_policies(db_session, tenant_id)
            if policies:
                doc_ids = self.knowledge_base.index_hr_policies(tenant_id, policies)
                results["policies_indexed"] = len(doc_ids)
            
            schema = self._extract_schema()
            if schema:
                self.knowledge_base.index_db_schema(tenant_id, schema)
                results["schema_indexed"] = True
        except Exception as e:
            self.audit.log_error(
                user_id="system",
                error_type="knowledge",
                error_message=str(e),
                metadata={"operation": "index_tenant_data", "tenant_id": tenant_id},
            )
        
        return results
    
    def _extract_policies(self, db_session, tenant_id: str) -> List[Dict[str, Any]]:
        """Extract HR policies from database"""
        policies = []
        try:
            from models import LeaveType, AttendancePolicy, PayrollPolicy
            
            leave_types = db_session.query(LeaveType).filter(
                LeaveType.organization_id == tenant_id,
                LeaveType.deleted_at == None,
            ).all()
            
            for lt in leave_types:
                policies.append({
                    "title": f"Leave Policy - {lt.name}",
                    "type": "leave",
                    "content": f"Leave Type: {lt.name}. "
                               f"Days per year: {getattr(lt, 'days_allowed', 'As per policy')}. "
                               f"Paid: {getattr(lt, 'is_paid', True)}. "
                               f"Encashable: {getattr(lt, 'is_encashable', False)}.",
                    "effective_date": datetime.now().isoformat(),
                    "version": "1.0",
                })
        except Exception:
            pass
        
        return policies
    
    def _extract_schema(self) -> Dict[str, Any]:
        """Extract database schema information"""
        return {
            "tables": [
                {"name": "employees", "description": "Employee master data"},
                {"name": "leave_applications", "description": "Leave applications and approvals"},
                {"name": "attendances", "description": "Daily attendance records"},
                {"name": "payrolls", "description": "Payroll records"},
                {"name": "leave_balances", "description": "Employee leave balances"},
            ],
            "relationships": [
                {"from": "leave_applications.employee_id", "to": "employees.id"},
                {"from": "attendances.employee_id", "to": "employees.id"},
                {"from": "payrolls.employee_id", "to": "employees.id"},
            ],
        }
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get AI engine statistics"""
        audit_stats = self.audit.get_statistics()
        escalation_stats = self.escalation_manager.get_statistics()
        
        return {
            "audit": audit_stats,
            "escalations": escalation_stats,
            "conversations": len(self._conversations),
            "total_messages": sum(len(messages) for messages in self._conversations.values()),
            "version": "1.0.0",
            "provider": "local_hrms_ai",
            "features": [
                "Natural Language Chat",
                "Action Execution",
                "Local Retrieval",
                "Multi-tenant Isolation",
                "Audit Trail",
                "Escalation Workflow",
                "Industry Templates",
                "No External Dependencies",
            ],
        }


# Global engine instance
_hrms_ai_engine: Optional[HRMSAIEngine] = None


def get_hrms_ai_engine() -> HRMSAIEngine:
    """Get the global HRMS AI engine"""
    global _hrms_ai_engine
    if _hrms_ai_engine is None:
        _hrms_ai_engine = HRMSAIEngine()
    return _hrms_ai_engine


def init_hrms_ai_engine(
    db_session_factory=None,
    llm_provider=None,
    notification_service=None,
) -> HRMSAIEngine:
    """Initialize the global HRMS AI engine"""
    global _hrms_ai_engine
    _hrms_ai_engine = HRMSAIEngine(
        db_session_factory=db_session_factory,
        llm_provider=llm_provider or LocalInferenceProvider(),
        notification_service=notification_service,
    )
    return _hrms_ai_engine
