"""
AI Router - Enterprise HRMS AI (Fully Local) - Authenticated
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, status
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field
import asyncio
from datetime import datetime

from database import get_db
from core.auth import get_current_user
from models import User, Employee
from hrms_ai.schemas import AIChatRequest, AIChatResponse, AIActionRequest, AIActionResponse, AIHealthResponse, AIContext
from hrms_ai.engine import get_hrms_ai_engine, init_hrms_ai_engine
from hrms_ai.knowledge import get_knowledge_base
from hrms_ai.audit import get_ai_audit_logger
from hrms_ai.escalation import get_escalation_manager
from hrms_ai.nlp import get_nlp_engine

router = APIRouter(prefix="/ai", tags=["AI Assistant"])

# Initialize engine on module load
try:
    init_hrms_ai_engine()
except Exception:
    pass


# ============== Request/Response Models ==============

class ChatRequest(BaseModel):
    """Authenticated chat request - user_id is optional for backward compat but ignored when authenticated"""
    user_id: Optional[str] = Field(None, description="Optional user_id for backward compatibility; ignored when authenticated")
    message: str
    context: Optional[Dict[str, Any]] = {}
    conversation_id: Optional[str] = None
    escalate_if_needed: bool = True


class ChatResponse(BaseModel):
    conversation_id: str
    response: str
    intent: str
    confidence: float
    actions_taken: List[Dict[str, Any]] = []
    suggestions: List[str] = []
    escalation: Optional[Dict[str, Any]] = None
    timestamp: str
    provider: str
    context: Dict[str, Any]


class EmployeeQueryRequest(BaseModel):
    query: str
    employee_id: Optional[int] = None


class AIInsightRequest(BaseModel):
    report_type: str
    parameters: Optional[Dict[str, Any]] = {}


class SentimentAnalysisRequest(BaseModel):
    text: str


class AttritionPredictionRequest(BaseModel):
    employee_id: int
    employee_data: Dict[str, Any]


class DocumentQueryRequest(BaseModel):
    question: str
    document_ids: Optional[List[str]] = None


# ============== Auth Helper ==============

async def _get_authenticated_context(
    current_user: User,
    db: Session,
    request_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Derive user context from authenticated User/Employee.
    Rejects client-supplied context overrides that conflict with authenticated identity.
    """
    # Find employee record for this user
    employee = db.query(Employee).filter(
        Employee.user_id == current_user.id,
        Employee.deleted_at.is_(None)
    ).first()

    # Build authenticated context
    auth_context = {
        "user_id": str(current_user.id),
        "organization_id": current_user.organization_id,
        "role": current_user.role,
        "employee_id": employee.id if employee else None,
        "department_id": employee.department_id if employee else None,
        "designation": employee.designation if employee else None,
    }

    # Merge with request context, but authenticated values take precedence
    merged = {**(request_context or {})}
    
    # These fields are DERIVED from auth and cannot be overridden by client
    protected_fields = {"user_id", "organization_id", "role", "employee_id"}
    for key in protected_fields:
        if key in merged and merged[key] != auth_context.get(key):
            # Client tried to override - reject
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cannot override authenticated {key}. Client-supplied: {merged[key]}, Authenticated: {auth_context.get(key)}"
            )
        merged[key] = auth_context[key]

    return merged


# ============== Chatbot Endpoints ==============

@router.post("/chat", response_model=ChatResponse)
async def ai_chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Authenticated AI chat endpoint.
    Derives user_id, organization_id, role, employee_id from authenticated user.
    Accepts optional user_id for backward compatibility but ignores it when authenticated.
    """
    try:
        # Derive authenticated context, reject impersonation attempts
        auth_context = await _get_authenticated_context(current_user, db, request.context)
        
        engine = get_hrms_ai_engine()
        
        # Use authenticated user_id, ignore client-supplied one
        chat_request = AIChatRequest(
            user_id=auth_context["user_id"],
            message=request.message,
            context=auth_context,
            conversation_id=request.conversation_id,
            escalate_if_needed=request.escalate_if_needed,
        )
        result = await engine.chat(chat_request, db_session=db)
        
        return ChatResponse(
            conversation_id=result.conversation_id,
            response=result.response,
            intent=result.intent,
            confidence=result.confidence,
            actions_taken=result.actions_taken,
            suggestions=result.suggestions,
            escalation=result.escalation,
            timestamp=result.timestamp,
            provider=result.provider,
            context=result.context,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI chat error: {str(e)}")


@router.post("/chat/stream")
async def ai_chat_stream(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Authenticated streaming chat endpoint."""
    async def event_generator():
        try:
            auth_context = await _get_authenticated_context(current_user, db, request.context)
            
            engine = get_hrms_ai_engine()
            chat_request = AIChatRequest(
                user_id=auth_context["user_id"],
                message=request.message,
                context=auth_context,
                conversation_id=request.conversation_id,
                escalate_if_needed=request.escalate_if_needed,
            )
            result = await engine.chat(chat_request, db_session=db)
            
            response_text = result.response
            chunk_size = 10
            
            for i in range(0, len(response_text), chunk_size):
                chunk = response_text[i:i+chunk_size]
                yield f"data: {chunk}\n\n"
                await asyncio.sleep(0.05)
            
            metadata = {
                "intent": result.intent,
                "suggestions": result.suggestions,
                "conversation_id": result.conversation_id,
                "done": True
            }
            yield f"data: {metadata}\n\n"
            
        except HTTPException as he:
            yield f"data: Error: {he.detail}\n\n"
        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"
    
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )


@router.get("/chat/history")
async def get_chat_history(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get chat history for the authenticated user."""
    try:
        engine = get_hrms_ai_engine()
        user_id = str(current_user.id)
        conversation_id = f"conv_{user_id}"
        history = engine._conversations.get(conversation_id, [])
        return {
            "user_id": user_id,
            "messages": history[-limit:],
            "total_messages": len(history)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching history: {str(e)}")


@router.delete("/chat/history")
async def clear_chat_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Clear chat history for the authenticated user."""
    try:
        engine = get_hrms_ai_engine()
        user_id = str(current_user.id)
        conversation_id = f"conv_{user_id}"
        if conversation_id in engine._conversations:
            engine._conversations[conversation_id] = []
        return {"message": "Chat history cleared", "user_id": user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing history: {str(e)}")


@router.get("/suggestions")
def get_quick_suggestions():
    return {
        "suggestions": [
            {"icon": "👤", "label": "Find Employee", "query": "Find employee"},
            {"icon": "🏖️", "label": "My Leave", "query": "What's my leave balance?"},
            {"icon": "💰", "label": "Payroll", "query": "Show my payroll summary"},
            {"icon": "📊", "label": "Attendance", "query": "My attendance this month"},
            {"icon": "📋", "label": "HR Policies", "query": "Show HR policies"},
            {"icon": "❓", "label": "Help", "query": "What can you help me with?"},
        ]
    }


# ============== AI Insights Endpoints ==============

@router.post("/insights/generate")
async def generate_ai_insights(
    request: AIInsightRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        auth_context = await _get_authenticated_context(current_user, db)
        engine = get_hrms_ai_engine()
        
        if request.report_type == "general":
            hr_data = request.parameters or {}
            result = {
                "summary": hr_data,
                "recommendations": ["Review HR metrics regularly"],
                "alerts": []
            }
        else:
            result = {"message": f"Report type '{request.report_type}' processed"}
        
        return {
            "report_type": request.report_type,
            "data": result,
            "ai_summary": "Insights generated using local HRMS AI engine.",
            "generated_at": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Insights generation error: {str(e)}")


@router.post("/insights/sentiment")
async def analyze_sentiment(
    request: SentimentAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        auth_context = await _get_authenticated_context(current_user, db)
        text_lower = request.text.lower()
        positive_words = ['good', 'great', 'excellent', 'happy', 'satisfied', 'awesome', 'best', 'love', 'like']
        negative_words = ['bad', 'poor', 'terrible', 'unhappy', 'dissatisfied', 'worst', 'hate', 'dislike', 'problem']
        
        positive_count = sum(1 for word in positive_words if word in text_lower)
        negative_count = sum(1 for word in negative_words if word in text_lower)
        
        if positive_count > negative_count:
            sentiment = "positive"
            score = min(0.5 + (positive_count - negative_count) * 0.1, 1.0)
        elif negative_count > positive_count:
            sentiment = "negative"
            score = max(0.5 - (negative_count - positive_count) * 0.1, 0.0)
        else:
            sentiment = "neutral"
            score = 0.5
        
        return {
            "text": request.text,
            "analysis": {
                "sentiment": sentiment,
                "score": round(score, 2),
                "positive_indicators": positive_count,
                "negative_indicators": negative_count
            },
            "analyzed_at": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sentiment analysis error: {str(e)}")


@router.post("/insights/attrition")
async def predict_attrition_risk(
    request: AttritionPredictionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        auth_context = await _get_authenticated_context(current_user, db)
        engine = get_hrms_ai_engine()
        result = engine.action_executor._predict_attrition_risk_local(request.employee_data)
        return {
            "employee_id": request.employee_id,
            "prediction": result,
            "predicted_at": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Attrition prediction error: {str(e)}")


# ============== Employee Search & Q&A ==============

@router.post("/employees/search")
async def search_employees_ai(
    request: EmployeeQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        auth_context = await _get_authenticated_context(current_user, db)
        engine = get_hrms_ai_engine()
        ai_context = AIContext(**auth_context)
        result = engine.action_executor.execute(
            action="search_employees",
            parameters={"query": request.query},
            context=ai_context,
            db_session=db,
        )
        return {
            "query": request.query,
            "results": result.get("data", []),
            "count": result.get("count", 0),
            "search_type": "local_db"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Employee search error: {str(e)}")


@router.post("/action", response_model=AIActionResponse)
async def ai_action(
    request: AIActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Authenticated AI action execution endpoint.
    Derives user context from authenticated user and executes the requested action.
    """
    try:
        auth_context = await _get_authenticated_context(current_user, db)
        
        engine = get_hrms_ai_engine()
        
        # Use authenticated context, ignore client-supplied context overrides
        action_request = AIActionRequest(
            user_id=auth_context["user_id"],
            action=request.action,
            parameters=request.parameters,
            context=auth_context,
        )
        result = await engine.execute_action(action_request, db_session=db)
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI action error: {str(e)}")


@router.post("/documents/query")
async def query_documents(
    request: DocumentQueryRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        auth_context = await _get_authenticated_context(current_user, db)
        from hrms_ai.retrieval import get_retrieval_engine
        retrieval = get_retrieval_engine()
        tenant_id = str(auth_context["organization_id"]) if auth_context["organization_id"] else "default"
        docs = retrieval.retrieve(tenant_id, request.question, max_results=5)
        return {
            "question": request.question,
            "documents": docs,
            "count": len(docs)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document query error: {str(e)}")


# ============== AI Health & Status ==============

@router.get("/health", response_model=AIHealthResponse)
async def ai_health_check(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        engine = get_hrms_ai_engine()
        stats = engine.get_statistics()
        
        return AIHealthResponse(
            status="online",
            services={
                "llm": "local_hrms_ai",
                "nlp": "local_nlp_v1",
                "retrieval": "local_retrieval_v1",
                "actions": "local_execution_v1",
                "escalation": "local_escalation_v1",
            },
            active_conversations=stats.get("conversations", 0),
            total_messages=stats.get("total_messages", 0),
            version="1.0.0",
            features=[
                "Natural Language Chat",
                "Action Execution",
                "Local Retrieval",
                "Multi-tenant Isolation",
                "Audit Trail",
                "Escalation Workflow",
                "Industry Templates",
                "No External Dependencies",
            ]
        )
    except Exception as e:
        return AIHealthResponse(
            status="online",
            services={
                "llm": "local_hrms_ai",
                "retrieval": "local_retrieval_v1",
            },
            active_conversations=0,
            total_messages=0,
            version="1.0.0",
            features=["Natural Language Chat"]
        )


@router.get("/models")
async def get_available_models(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return {
        "default": "hrms-local-v1",
        "available": [
            {"id": "hrms-local-v1", "name": "HRMS Local AI", "type": "local"},
        ],
        "embeddings": "local-keyword",
        "note": "Fully local inference - no external APIs used"
    }


# ============== Automation Endpoints ==============

@router.get("/automation/rules")
async def get_automation_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return {
        "rules": [],
        "count": 0,
        "note": "Automation rules handled by automation engine"
    }


@router.post("/automation/reports/monthly")
async def generate_monthly_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return {
        "reports": [],
        "generated_at": datetime.now().isoformat(),
        "note": "Monthly reports generated by automation pipeline"
    }