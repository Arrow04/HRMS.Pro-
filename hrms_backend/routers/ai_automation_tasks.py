"""AI Automation Tasks Router — Ollama/Phi3-powered HR task automation."""
import json, os, httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from core.auth import get_current_user
from models import User

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "phi3:latest")

router = APIRouter(prefix="/api/ai/automation", tags=["AI Automation"])


class AutomationRequest(BaseModel):
    task: str  # resume_parse | leave_suggest | payroll_reconcile | shift_schedule | exit_analyze | review_summarize
    context: dict = {}


async def call_ollama(prompt: str, system: str = "") -> str:
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "system": system,
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": 1024},
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
            resp.raise_for_status()
            return resp.json().get("response", "").strip()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Ollama unavailable: {str(e)}")


@router.post("")
async def run_automation_task(req: AutomationRequest, current_user: User = Depends(get_current_user)):
    prompts = {
        "resume_parse": {
            "system": "You parse resumes into structured JSON. Return only valid JSON.",
            "prompt": f"Extract from this resume: name, email, phone, skills (array), experience (array of {{company, role, duration, description}}), education (array of {{degree, institution, year}}). Resume: {req.context.get('text', '')}",
            "parser": json.loads,
        },
        "leave_suggest": {
            "system": "You are an HR policy expert. Suggest approve or reject with a reason based on leave balance, policy, and history.",
            "prompt": f"Employee leave request: {json.dumps(req.context)}. Suggest: decision (approve/reject), reason, and any recommendations. Return JSON with keys: decision, reason, recommendations (list).",
            "parser": json.loads,
        },
        "payroll_reconcile": {
            "system": "You detect payroll discrepancies between attendance and payroll data.",
            "prompt": f"Compare attendance and payroll: {json.dumps(req.context)}. Flag discrepancies. Return JSON with keys: discrepancies (array of {{employee, issue, severity, amount}}), summary, recommendations.",
            "parser": json.loads,
        },
        "shift_schedule": {
            "system": "You create optimal shift schedules balancing workload and employee preferences.",
            "prompt": f"Create a shift schedule from: {json.dumps(req.context)}. Return JSON with keys: schedule (array of {{employee, shift, date}}), notes, conflicts.",
            "parser": json.loads,
        },
        "exit_analyze": {
            "system": "You analyze exit interview responses and extract insights.",
            "prompt": f"Analyze this exit data: {json.dumps(req.context)}. Return JSON with keys: reasons (array), sentiment (positive/negative/neutral), key_issues (array), recommendations (array).",
            "parser": json.loads,
        },
        "review_summarize": {
            "system": "You summarize employee performance reviews into concise, actionable summaries.",
            "prompt": f"Summarize this performance review: {json.dumps(req.context)}. Return JSON with keys: summary, strengths (array), improvements (array), rating_out_of_10 (number), next_steps (array).",
            "parser": json.loads,
        },
    }

    cfg = prompts.get(req.task)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unknown task: {req.task}")

    raw = await call_ollama(cfg["prompt"], cfg["system"])
    try:
        parsed = cfg["parser"](raw)
    except (json.JSONDecodeError, ValueError):
        parsed = {"raw": raw, "note": "Could not parse structured output"}
    return {"task": req.task, "result": parsed, "model": OLLAMA_MODEL}
