"""
HRMS AI Guided Workflows
Step-by-step guided processes for complex HR tasks
"""
from typing import Dict, Any, List, Optional
from enum import Enum
from dataclasses import dataclass, field


class WorkflowStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ESCALATED = "escalated"


@dataclass
class WorkflowStep:
    step_id: str
    title: str
    description: str
    action: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    required_fields: List[str] = field(default_factory=list)
    optional_fields: List[str] = field(default_factory=list)
    next_step: Optional[str] = None
    completion_message: str = "Step completed successfully."
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "step_id": self.step_id,
            "title": self.title,
            "description": self.description,
            "action": self.action,
            "parameters": self.parameters,
            "required_fields": self.required_fields,
            "optional_fields": self.optional_fields,
            "next_step": self.next_step,
            "completion_message": self.completion_message,
        }


class GuidedWorkflowEngine:
    """Guides users through complex HR processes step by step"""
    
    def __init__(self):
        self.workflows = self._load_workflows()
        self._active_workflows: Dict[str, Dict[str, Any]] = {}
    
    def _load_workflows(self) -> Dict[str, List[WorkflowStep]]:
        return {
            "leave_application": [
                WorkflowStep(
                    step_id="check_balance",
                    title="Check Leave Balance",
                    description="First, let me check your available leave balance.",
                    action="check_leave_balance",
                    parameters={},
                    next_step="select_details",
                    completion_message="I've checked your leave balance. Now let's proceed with the application.",
                ),
                WorkflowStep(
                    step_id="select_details",
                    title="Enter Leave Details",
                    description="Please provide the following details for your leave application:",
                    action="collect_leave_details",
                    parameters={},
                    required_fields=["start_date", "end_date", "leave_type", "reason"],
                    optional_fields=["is_half_day", "handover_to", "emergency_contact"],
                    next_step="submit_application",
                    completion_message="Details collected. Ready to submit.",
                ),
                WorkflowStep(
                    step_id="submit_application",
                    title="Submit Leave Application",
                    description="I will now submit your leave application for approval.",
                    action="apply_leave",
                    parameters={},
                    next_step="confirmation",
                    completion_message="Your leave application has been submitted successfully!",
                ),
                WorkflowStep(
                    step_id="confirmation",
                    title="Confirmation",
                    description="Your leave application has been submitted and is pending approval.",
                    action="confirm_leave_submission",
                    parameters={},
                    completion_message="Workflow completed.",
                ),
            ],
            "resignation": [
                WorkflowStep(
                    step_id="confirm_intent",
                    title="Confirm Resignation",
                    description="I understand you want to resign. This is an important decision. Let me guide you through the process.",
                    action="confirm_resignation_intent",
                    parameters={},
                    next_step="select_dates",
                    completion_message="Intent confirmed. Let's proceed.",
                ),
                WorkflowStep(
                    step_id="select_dates",
                    title="Select Last Working Day",
                    description="Please provide your last working day and notice period details.",
                    action="collect_resignation_details",
                    parameters={},
                    required_fields=["last_working_day", "notice_period", "reason"],
                    optional_fields=["handover_notes", "contact_after_exit"],
                    next_step="generate_resignation_email",
                    completion_message="Details collected.",
                ),
                WorkflowStep(
                    step_id="generate_resignation_email",
                    title="Generate Resignation Email",
                    description="I will generate a resignation email for you to send to your manager and HR.",
                    action="generate_resignation_email",
                    parameters={},
                    next_step="submit_resignation",
                    completion_message="Resignation email generated.",
                ),
                WorkflowStep(
                    step_id="submit_resignation",
                    title="Submit Resignation",
                    description="I will now record your resignation in the system.",
                    action="submit_resignation",
                    parameters={},
                    next_step="exit_formalities",
                    completion_message="Resignation submitted.",
                ),
                WorkflowStep(
                    step_id="exit_formalities",
                    title="Exit Formalities",
                    description="Here are your exit formalities and checklist.",
                    action="show_exit_checklist",
                    parameters={},
                    completion_message="Exit process initiated.",
                ),
            ],
            "attendance_correction": [
                WorkflowStep(
                    step_id="select_date",
                    title="Select Date",
                    description="Please provide the date for which you want to correct attendance.",
                    action="collect_attendance_date",
                    parameters={},
                    required_fields=["date"],
                    next_step="show_current_record",
                    completion_message="Date selected.",
                ),
                WorkflowStep(
                    step_id="show_current_record",
                    title="Current Attendance Record",
                    description="Here is your current attendance record for that date.",
                    action="show_attendance_record",
                    parameters={},
                    next_step="collect_correction",
                    completion_message="Record displayed.",
                ),
                WorkflowStep(
                    step_id="collect_correction",
                    title="Enter Correction Details",
                    description="Please provide the correct attendance details:",
                    action="collect_attendance_correction",
                    parameters={},
                    required_fields=["correct_status", "reason"],
                    optional_fields=["check_in", "check_out", "work_hours"],
                    next_step="generate_correction_email",
                    completion_message="Correction details collected.",
                ),
                WorkflowStep(
                    step_id="generate_correction_email",
                    title="Generate Correction Email",
                    description="I will generate an attendance correction request email for you.",
                    action="generate_attendance_correction_email",
                    parameters={},
                    next_step="submit_correction",
                    completion_message="Correction email generated.",
                ),
                WorkflowStep(
                    step_id="submit_correction",
                    title="Submit Correction Request",
                    description="I will now submit your attendance correction request for approval.",
                    action="submit_attendance_correction",
                    parameters={},
                    completion_message="Correction request submitted.",
                ),
            ],
            "onboarding": [
                WorkflowStep(
                    step_id="welcome",
                    title="Welcome!",
                    description="Welcome to the organization! Let me guide you through the onboarding process.",
                    action="welcome_message",
                    parameters={},
                    next_step="personal_details",
                    completion_message="Welcome message sent.",
                ),
                WorkflowStep(
                    step_id="personal_details",
                    title="Complete Personal Details",
                    description="Please provide your personal information including address, emergency contact, etc.",
                    action="collect_personal_details",
                    parameters={},
                    required_fields=["phone", "address", "emergency_contact", "emergency_phone"],
                    optional_fields=["current_address", "permanent_address", "blood_group", "marital_status"],
                    next_step="bank_details",
                    completion_message="Personal details collected.",
                ),
                WorkflowStep(
                    step_id="bank_details",
                    title="Bank Details",
                    description="Please provide your bank account details for salary disbursement.",
                    action="collect_bank_details",
                    parameters={},
                    required_fields=["bank_name", "bank_account_number", "ifsc_code", "account_holder_name"],
                    next_step="documents",
                    completion_message="Bank details collected.",
                ),
                WorkflowStep(
                    step_id="documents",
                    title="Upload Documents",
                    description="Please upload the following documents:",
                    action="collect_documents",
                    parameters={},
                    required_fields=["id_proof", "address_proof", "educational_certificates"],
                    optional_fields=["experience_certificates", "passport_photos", "pan_card", "aadhar_card"],
                    next_step="it_setup",
                    completion_message="Documents collected.",
                ),
                WorkflowStep(
                    step_id="it_setup",
                    title="IT Setup",
                    description="Your IT setup is being prepared. Please collect your laptop and credentials from the IT desk.",
                    action="it_setup_instructions",
                    parameters={},
                    next_step="orientation",
                    completion_message="IT setup instructions provided.",
                ),
                WorkflowStep(
                    step_id="orientation",
                    title="Orientation",
                    description="You are required to attend the mandatory orientation session.",
                    action="orientation_details",
                    parameters={},
                    completion_message="Onboarding workflow completed.",
                ),
            ],
            "expense_claim": [
                WorkflowStep(
                    step_id="expense_details",
                    title="Expense Details",
                    description="Please provide expense details:",
                    action="collect_expense_details",
                    parameters={},
                    required_fields=["expense_type", "amount", "date", "description"],
                    optional_fields=["receipt_url", "project_code"],
                    next_step="submit_claim",
                    completion_message="Expense details collected.",
                ),
                WorkflowStep(
                    step_id="submit_claim",
                    title="Submit Claim",
                    description="I will submit your expense claim for approval.",
                    action="submit_expense_claim",
                    parameters={},
                    completion_message="Expense claim submitted.",
                ),
            ],
            "asset_request": [
                WorkflowStep(
                    step_id="select_asset",
                    title="Select Asset",
                    description="What asset do you need?",
                    action="collect_asset_request",
                    parameters={},
                    required_fields=["asset_type", "reason"],
                    optional_fields=["priority", "required_by_date"],
                    next_step="submit_request",
                    completion_message="Asset request details collected.",
                ),
                WorkflowStep(
                    step_id="submit_request",
                    title="Submit Request",
                    description="I will submit your asset request for approval.",
                    action="submit_asset_request",
                    parameters={},
                    completion_message="Asset request submitted.",
                ),
            ],
            "grievance": [
                WorkflowStep(
                    step_id="describe_issue",
                    title="Describe Your Issue",
                    description="Please describe the issue you're facing. What type of grievance is this?",
                    action="collect_grievance_details",
                    parameters={},
                    required_fields=["grievance_type", "description"],
                    optional_fields=["incident_date", "involved_parties", "evidence"],
                    next_step="submit_grievance",
                    completion_message="Grievance details collected.",
                ),
                WorkflowStep(
                    step_id="submit_grievance",
                    title="Submit Grievance",
                    description="I will submit your grievance for review by the HR team.",
                    action="submit_grievance",
                    parameters={},
                    completion_message="Grievance submitted successfully.",
                ),
            ],
            "performance_review": [
                WorkflowStep(
                    step_id="review_info",
                    title="Performance Review Info",
                    description="I can help you with your performance review. Would you like to see your review history or prepare for a new review?",
                    action="show_review_options",
                    parameters={},
                    next_step="self_assessment",
                    completion_message="Review information displayed.",
                ),
                WorkflowStep(
                    step_id="self_assessment",
                    title="Self Assessment",
                    description="Please provide your self-assessment for the review period.",
                    action="collect_self_assessment",
                    parameters={},
                    required_fields=["review_period", "achievements", "goals"],
                    optional_fields=["challenges", "training_needs", "feedback"],
                    next_step="submit_review",
                    completion_message="Self-assessment collected.",
                ),
                WorkflowStep(
                    step_id="submit_review",
                    title="Submit Review",
                    description="I will submit your self-assessment for manager review.",
                    action="submit_performance_review",
                    parameters={},
                    completion_message="Performance review submitted.",
                ),
            ],
        }
    
    def start_workflow(self, workflow_id: str, user_id: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Start a guided workflow"""
        if workflow_id not in self.workflows:
            return {"success": False, "error": f"Unknown workflow: {workflow_id}"}
        
        workflow_steps = self.workflows[workflow_id]
        if not workflow_steps:
            return {"success": False, "error": "Workflow has no steps"}
        
        first_step = workflow_steps[0]
        
        workflow_session = {
            "workflow_id": workflow_id,
            "user_id": user_id,
            "current_step_index": 0,
            "current_step_id": first_step.step_id,
            "status": WorkflowStatus.IN_PROGRESS,
            "context": context,
            "collected_data": {},
            "completed_steps": [],
        }
        
        self._active_workflows[f"{user_id}_{workflow_id}"] = workflow_session
        
        return {
            "success": True,
            "workflow_id": workflow_id,
            "current_step": first_step.to_dict(),
            "message": f"Started workflow: {workflow_id}. Step 1: {first_step.title}",
        }
    
    def advance_workflow(
        self,
        user_id: str,
        workflow_id: str,
        collected_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Advance to the next step in the workflow"""
        workflow_key = f"{user_id}_{workflow_id}"
        workflow_session = self._active_workflows.get(workflow_key)
        
        if not workflow_session:
            return {"success": False, "error": "Workflow not found. Please start again."}
        
        if workflow_session["status"] != WorkflowStatus.IN_PROGRESS:
            return {"success": False, "error": "Workflow is not in progress"}
        
        # Store collected data
        workflow_session["collected_data"].update(collected_data)
        
        # Get current step
        workflow_steps = self.workflows[workflow_id]
        current_index = workflow_session["current_step_index"]
        current_step = workflow_steps[current_index]
        
        # Mark current step as completed
        workflow_session["completed_steps"].append(current_step.step_id)
        
        # Move to next step
        next_index = current_index + 1
        if next_index >= len(workflow_steps):
            # Workflow completed
            workflow_session["status"] = WorkflowStatus.COMPLETED
            workflow_session["current_step_id"] = None
            
            return {
                "success": True,
                "workflow_id": workflow_id,
                "status": WorkflowStatus.COMPLETED.value,
                "message": f"Workflow '{workflow_id}' completed successfully!",
                "collected_data": workflow_session["collected_data"],
            }
        
        next_step = workflow_steps[next_index]
        workflow_session["current_step_index"] = next_index
        workflow_session["current_step_id"] = next_step.step_id
        
        return {
            "success": True,
            "workflow_id": workflow_id,
            "current_step": next_step.to_dict(),
            "message": f"Step completed. Next: {next_step.title}",
            "collected_data": workflow_session["collected_data"],
        }
    
    def get_workflow_status(self, user_id: str, workflow_id: str) -> Dict[str, Any]:
        """Get current workflow status"""
        workflow_key = f"{user_id}_{workflow_id}"
        workflow_session = self._active_workflows.get(workflow_key)
        
        if not workflow_session:
            return {"success": False, "error": "Workflow not found"}
        
        current_step = None
        if workflow_session["current_step_id"]:
            workflow_steps = self.workflows[workflow_id]
            for step in workflow_steps:
                if step.step_id == workflow_session["current_step_id"]:
                    current_step = step.to_dict()
                    break
        
        return {
            "success": True,
            "workflow_id": workflow_id,
            "status": workflow_session["status"].value,
            "current_step": current_step,
            "completed_steps": workflow_session["completed_steps"],
            "collected_data": workflow_session["collected_data"],
        }
    
    def cancel_workflow(self, user_id: str, workflow_id: str) -> Dict[str, Any]:
        """Cancel an active workflow"""
        workflow_key = f"{user_id}_{workflow_id}"
        workflow_session = self._active_workflows.get(workflow_key)
        
        if not workflow_session:
            return {"success": False, "error": "Workflow not found"}
        
        workflow_session["status"] = WorkflowStatus.CANCELLED
        del self._active_workflows[workflow_key]
        
        return {"success": True, "message": f"Workflow '{workflow_id}' cancelled."}
    
    def get_available_workflows(self) -> List[Dict[str, Any]]:
        """Get list of available workflows"""
        return [
            {
                "workflow_id": workflow_id,
                "steps": len(steps),
                "step_titles": [step.title for step in steps],
            }
            for workflow_id, steps in self.workflows.items()
        ]


# Singleton
_workflow_engine: Optional[GuidedWorkflowEngine] = None


def get_workflow_engine() -> GuidedWorkflowEngine:
    global _workflow_engine
    if _workflow_engine is None:
        _workflow_engine = GuidedWorkflowEngine()
    return _workflow_engine
