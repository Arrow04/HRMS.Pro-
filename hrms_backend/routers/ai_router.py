"""
AI Router - Advanced AI Features for HRMS
Includes: Chatbot, AI Insights, Predictive Analytics, Document Q&A
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
import asyncio
from datetime import datetime

from database_enterprise import get_db
from ai_service import ai_assistant, ChatContext, get_ai_assistant
from ai_engine import ai_engine, chatbot, automation

router = APIRouter(prefix="/ai", tags=["AI Assistant"])

# ============== Request/Response Models ==============

class ChatRequest(BaseModel):
    user_id: str
    message: str
    context: Optional[Dict[str, Any]] = {}

class ChatResponse(BaseModel):
    response: str
    intent: str
    suggestions: List[str]
    timestamp: str
    context: Dict[str, Any]

class EmployeeQueryRequest(BaseModel):
    query: str
    employee_id: Optional[int] = None

class AIInsightRequest(BaseModel):
    report_type: str  # attendance, payroll, leave, attrition
    parameters: Optional[Dict[str, Any]] = {}

class SentimentAnalysisRequest(BaseModel):
    text: str

class AttritionPredictionRequest(BaseModel):
    employee_id: int
    employee_data: Dict[str, Any]

class DocumentQueryRequest(BaseModel):
    question: str
    document_ids: Optional[List[str]] = None


# ============== Chatbot Endpoints ==============

@router.post("/chat", response_model=ChatResponse)
async def ai_chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    AI-powered chat endpoint with context awareness
    
    Example:
    {
        "user_id": "user_123",
        "message": "What's my leave balance?",
        "context": {
            "employee_id": 123,
            "organization_id": 1,
            "role": "employee"
        }
    }
    """
    try:
        context = ChatContext(
            user_id=request.user_id,
            employee_id=request.context.get('employee_id'),
            organization_id=request.context.get('organization_id'),
            role=request.context.get('role')
        )
        
        result = await ai_assistant.chat(request.message, context)
        
        return ChatResponse(
            response=result["response"],
            intent=result["intent"],
            suggestions=result["suggestions"],
            timestamp=result["timestamp"],
            context=result["context"]
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI chat error: {str(e)}")


@router.post("/chat/stream")
async def ai_chat_stream(request: ChatRequest):
    """
    Streaming chat endpoint for real-time responses
    """
    async def event_generator():
        try:
            context = ChatContext(
                user_id=request.user_id,
                employee_id=request.context.get('employee_id'),
                organization_id=request.context.get('organization_id'),
                role=request.context.get('role')
            )
            
            result = await ai_assistant.chat(request.message, context)
            
            # Stream response chunks
            response_text = result["response"]
            chunk_size = 10
            
            for i in range(0, len(response_text), chunk_size):
                chunk = response_text[i:i+chunk_size]
                yield f"data: {chunk}\n\n"
                await asyncio.sleep(0.05)  # Simulate typing effect
            
            # Send final metadata
            metadata = {
                "intent": result["intent"],
                "suggestions": result["suggestions"],
                "done": True
            }
            yield f"data: {metadata}\n\n"
            
        except Exception as e:
            yield f"data: Error: {str(e)}\n\n"
    
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream"
    )


@router.get("/chat/history/{user_id}")
def get_chat_history(user_id: str, limit: int = 50):
    """Get chat history for a user"""
    try:
        history = chatbot.conversation_history.get(user_id, [])
        return {
            "user_id": user_id,
            "messages": history[-limit:],
            "total_messages": len(history)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching history: {str(e)}")


@router.delete("/chat/history/{user_id}")
def clear_chat_history(user_id: str):
    """Clear chat history for a user"""
    try:
        if user_id in chatbot.conversation_history:
            chatbot.conversation_history[user_id] = []
        return {"message": "Chat history cleared", "user_id": user_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing history: {str(e)}")


@router.get("/suggestions")
def get_quick_suggestions():
    """Get quick suggestion buttons for chatbot UI"""
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
    db: Session = Depends(get_db)
):
    """
    Generate AI-powered HR insights
    
    Report types: attendance, payroll, leave, attrition, general
    """
    try:
        if request.report_type == "attrition":
            # Sample employee data - in production, fetch from DB
            sample_data = {
                "leaves_taken": 15,
                "performance_score": 75,
                "years_in_role": 2
            }
            result = ai_engine.predict_attrition_risk(sample_data)
            
        elif request.report_type == "payroll":
            sample_payroll = [
                {"amount": 50000, "department": "Engineering", "employee_id": 1},
                {"amount": 45000, "department": "HR", "employee_id": 2},
            ]
            result = ai_engine.generate_payroll_insights(sample_payroll)
            
        elif request.report_type == "general":
            hr_data = request.parameters or {}
            result = ai_assistant.generate_hr_insights(hr_data)
            
        else:
            result = {"message": f"Report type '{request.report_type}' not fully implemented yet"}
        
        # Generate natural language summary
        summary = await ai_assistant.generate_report_summary(
            request.report_type, 
            result if isinstance(result, dict) else {}
        )
        
        return {
            "report_type": request.report_type,
            "data": result,
            "ai_summary": summary,
            "generated_at": datetime.now().isoformat()
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Insights generation error: {str(e)}")


@router.post("/insights/sentiment")
def analyze_sentiment(request: SentimentAnalysisRequest):
    """
    Analyze sentiment of employee feedback or text
    """
    try:
        result = ai_assistant.analyze_employee_sentiment(request.text)
        return {
            "text": request.text,
            "analysis": result,
            "analyzed_at": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sentiment analysis error: {str(e)}")


@router.post("/insights/attrition")
def predict_attrition_risk(request: AttritionPredictionRequest):
    """
    Predict attrition risk for an employee
    """
    try:
        result = ai_assistant.predict_attrition_risk(request.employee_data)
        return {
            "employee_id": request.employee_id,
            "prediction": result,
            "predicted_at": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Attrition prediction error: {str(e)}")


# ============== Employee Search & Q&A ==============

@router.post("/employees/search")
def search_employees_ai(request: EmployeeQueryRequest, db: Session = Depends(get_db)):
    """
    AI-powered employee search using natural language
    """
    try:
        results = ai_assistant.vector_store.search_employees(request.query)
        
        return {
            "query": request.query,
            "results": results,
            "count": len(results),
            "search_type": "semantic"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Employee search error: {str(e)}")


@router.post("/documents/query")
def query_documents(request: DocumentQueryRequest):
    """
    Query HR documents using AI (RAG - Retrieval Augmented Generation)
    """
    try:
        results = ai_assistant.vector_store.query_documents(
            request.question, 
            n_results=5
        )
        
        return {
            "question": request.question,
            "documents": results,
            "count": len(results)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document query error: {str(e)}")


# ============== AI Health & Status ==============

@router.get("/health")
def ai_health_check():
    """Health check for AI services"""
    try:
        # Check vector store
        vector_status = "disconnected"
        vector_collections = 0
        try:
            if ai_assistant.vector_store and ai_assistant.vector_store.available and ai_assistant.vector_store.client:
                collections = ai_assistant.vector_store.client.list_collections()
                vector_status = "connected"
                vector_collections = len(collections)
        except Exception as ve:
            print(f"Vector store check failed: {ve}")
            vector_status = "disconnected"
            vector_collections = 0
        
        # Check which LLM providers are available
        llm_provider = "HuggingFace Inference API"
        try:
            from ai_service import enterprise_ai
            available_providers = [p for p, provider in enterprise_ai.providers.items() if provider.available]
            if available_providers:
                llm_provider = f"Multi-Provider ({', '.join(available_providers)})"
        except Exception as exc:
            pass
        
        return {
            "status": "online",
            "services": {
                "llm": llm_provider,
                "vector_store": vector_status,
                "collections": vector_collections
            },
            "active_conversations": len(chatbot.conversation_history),
            "total_messages": sum(len(h) for h in chatbot.conversation_history.values()),
            "version": "2.0.0",
            "model": "mistralai/Mistral-7B-Instruct-v0.2",
            "features": [
                "Natural Language Chat",
                "Semantic Employee Search",
                "Document Q&A (RAG)",
                "Sentiment Analysis",
                "Attrition Prediction",
                "AI-Powered Insights"
            ]
        }
    except Exception as e:
        print(f"Health check error: {e}")
        # Return partial status even on error
        return {
            "status": "online",
            "services": {
                "llm": "HuggingFace Inference API",
                "vector_store": "disconnected",
                "collections": 0
            },
            "active_conversations": 0,
            "total_messages": 0,
            "version": "2.0.0",
            "model": "mistralai/Mistral-7B-Instruct-v0.2",
            "features": [
                "Natural Language Chat"
            ],
            "error": str(e)
        }


@router.get("/models")
def get_available_models():
    """Get list of available AI models"""
    return {
        "default": "mistralai/Mistral-7B-Instruct-v0.2",
        "available": [
            {"id": "mistralai/Mistral-7B-Instruct-v0.2", "name": "Mistral 7B", "type": "chat"},
            {"id": "meta-llama/Llama-2-7b-chat-hf", "name": "Llama 2 7B", "type": "chat"},
            {"id": "google/flan-t5-large", "name": "Flan-T5", "type": "instruct"},
        ],
        "embeddings": "sentence-transformers/all-MiniLM-L6-v2"
    }


# ============== Automation Endpoints ==============

@router.get("/automation/rules")
def get_automation_rules():
    """Get default automation rules"""
    automation.setup_default_automations()
    return {
        "rules": automation.rules,
        "count": len(automation.rules)
    }


@router.post("/automation/reports/monthly")
def generate_monthly_reports():
    """Generate AI-powered monthly HR reports"""
    reports = automation.generate_monthly_reports()
    return {
        "reports": reports,
        "generated_at": datetime.now().isoformat()
    }
