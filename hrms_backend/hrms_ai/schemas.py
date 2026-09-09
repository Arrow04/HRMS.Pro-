"""
Pydantic schemas for HRMS AI
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime


class AIChatRequest(BaseModel):
    user_id: str
    message: str
    context: Optional[Dict[str, Any]] = {}
    conversation_id: Optional[str] = None
    escalate_if_needed: bool = True


class AIChatResponse(BaseModel):
    conversation_id: str
    response: str
    intent: str
    confidence: float = Field(ge=0.0, le=1.0)
    actions_taken: List[Dict[str, Any]] = []
    suggestions: List[str] = []
    escalation: Optional[Dict[str, Any]] = None
    timestamp: str
    provider: str
    context: Dict[str, Any]


class AIActionRequest(BaseModel):
    user_id: str
    action: str
    parameters: Dict[str, Any] = {}
    context: Optional[Dict[str, Any]] = {}


class AIActionResponse(BaseModel):
    success: bool
    action: str
    result: Any
    message: str
    timestamp: str
    audit_id: Optional[str] = None


class AIEscalationRequest(BaseModel):
    conversation_id: str
    reason: str
    priority: str = "medium"  # low, medium, high, critical
    assigned_to: Optional[str] = None


class AIEscalationResponse(BaseModel):
    escalation_id: str
    status: str
    assigned_to: Optional[str]
    estimated_response_time: str
    created_at: str


class AIContext(BaseModel):
    user_id: str
    employee_id: Optional[int] = None
    organization_id: Optional[int] = None
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    company_code: Optional[str] = None
    role: Optional[str] = None
    department_id: Optional[int] = None
    department_name: Optional[str] = None
    designation: Optional[str] = None
    permissions: List[str] = []
    industry: Optional[str] = None
    country: Optional[str] = None
    organization_name: Optional[str] = None
    company_settings: Dict[str, Any] = {}
    conversation_history: List[Dict[str, Any]] = []
    recent_actions: List[Dict[str, Any]] = []


class AIHealthResponse(BaseModel):
    status: str
    services: Dict[str, Any]
    active_conversations: int
    total_messages: int
    version: str
    features: List[str]
