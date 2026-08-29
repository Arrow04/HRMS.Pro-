"""
Chatbot API Router - HR Assistant Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, Optional
from pydantic import BaseModel

from database_enterprise import get_db
from ai_engine import chatbot, ai_engine

router = APIRouter(tags=["chatbot"])

class ChatMessage(BaseModel):
    user_id: str
    message: str
    context: Optional[Dict[str, Any]] = {}

class ChatResponse(BaseModel):
    response: str
    intent: str
    suggestions: list
    timestamp: str

@router.post("/message", response_model=ChatResponse)
def send_message(chat_msg: ChatMessage, db: Session = Depends(get_db)):
    """
    Send message to HR chatbot and get response
    
    Example queries:
    - "What's my leave balance?"
    - "Find employee John Doe"
    - "Show payroll summary"
    - "Attendance this month"
    """
    try:
        result = chatbot.process_message(
            user_id=chat_msg.user_id,
            message=chat_msg.message,
            context=chat_msg.context
        )
        
        from datetime import datetime
        
        return ChatResponse(
            response=result["response"],
            intent=result["intent"],
            suggestions=result["suggestions"],
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
        "messages": history[-50:],  # Last 50 messages
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
    """
    Generate AI-powered insights report
    
    Types: attrition, payroll, performance, custom
    """
    parameters = parameters or {}
    
    if report_type == "attrition":
        # Sample data - replace with actual DB query
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
        "version": "1.0.0"
    }
