"""
HRMS AI Email Templates and Generation
Pre-built email templates for all HR communications
"""
from typing import Dict, Any, List, Optional
from datetime import datetime
from enum import Enum


class EmailType(str, Enum):
    LEAVE_REQUEST = "leave_request"
    LEAVE_APPROVAL = "leave_approval"
    LEAVE_REJECTION = "leave_rejection"
    LEAVE_CANCELLATION = "leave_cancellation"
    RESIGNATION = "resignation"
    EXIT_ACKNOWLEDGEMENT = "exit_acknowledgement"
    ATTENDANCE_CORRECTION = "attendance_correction"
    ATTENDANCE_REGULARIZATION = "attendance_regularization"
    PAYSLIP_GENERATED = "payslip_generated"
    SALARY_DISBURSEMENT = "salary_disbursement"
    WELCOME = "welcome"
    ONBOARDING = "onboarding"
    PROBATION_COMPLETION = "probation_completion"
    PROMOTION = "promotion"
    TRANSFER = "transfer"
    POLICY_UPDATE = "policy_update"
    MEETING_INVITE = "meeting_invite"
    REMINDER = "reminder"
    BIRTHDAY = "birthday"
    ANNIVERSARY = "anniversary"
    TAX_FORM = "tax_form"
    EXPENSE_CLAIM = "expense_claim"
    ASSET_REQUEST = "asset_request"
    GRIEVANCE_ACKNOWLEDGEMENT = "grievance_acknowledgement"
    PERFORMANCE_REVIEW = "performance_review"
    REFERRAL_ACKNOWLEDGEMENT = "referral_acknowledgement"
    ASSET_ALLOCATION = "asset_allocation"
    EXPENSE_REIMBURSEMENT = "expense_reimbursement"
    WARNING_LETTER = "warning_letter"
    SHOW_CAUSE_NOTICE = "show_cause_notice"


class EmailTemplateEngine:
    """Generates HR emails dynamically based on context"""
    
    def __init__(self):
        self.templates = self._load_templates()
    
    def _load_templates(self) -> Dict[EmailType, Dict[str, Any]]:
        return {
            EmailType.LEAVE_REQUEST: {
                "subject": "Leave Application - {employee_name} - {start_date} to {end_date}",
                "body": """Dear {manager_name},

I hope this email finds you well. I am writing to formally request leave from {start_date} to {end_date} ({total_days} days) for the following reason: {reason}.

Leave Details:
- Employee: {employee_name} ({employee_code})
- Department: {department}
- Leave Type: {leave_type}
- Period: {start_date} to {end_date}
- Total Days: {total_days}
- Reason: {reason}

I have ensured that my pending tasks are handed over to {handover_to} and all urgent work will be covered during my absence. I will be available on phone for any emergencies.

Please approve this leave at your earliest convenience. Thank you for your understanding.

Best regards,
{employee_name}
{employee_code}
{department}""",
                "variables": ["employee_name", "employee_code", "department", "manager_name", "start_date", "end_date", "total_days", "leave_type", "reason", "handover_to"],
            },
            EmailType.LEAVE_APPROVAL: {
                "subject": "Leave Approved - {employee_name} - {start_date} to {end_date}",
                "body": """Dear {employee_name},

Your leave application has been approved. Here are the details:

- Leave Type: {leave_type}
- Period: {start_date} to {end_date}
- Total Days: {total_days}
- Approved By: {approved_by}
- Approval Date: {approval_date}

Please ensure a smooth handover of your responsibilities before proceeding on leave. Have a great time off!

Best regards,
HR Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "leave_type", "start_date", "end_date", "total_days", "approved_by", "approval_date", "company_name"],
            },
            EmailType.LEAVE_REJECTION: {
                "subject": "Leave Application Review - {employee_name}",
                "body": """Dear {employee_name},

Thank you for your leave application. After careful review, we are unable to approve your request at this time due to the following reason: {rejection_reason}.

Leave Details:
- Period: {start_date} to {end_date}
- Leave Type: {leave_type}

Please feel free to reschedule your leave or discuss alternative dates with your manager.

Best regards,
HR Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "start_date", "end_date", "leave_type", "rejection_reason", "company_name"],
            },
            EmailType.RESIGNATION: {
                "subject": "Resignation - {employee_name} ({employee_code})",
                "body": """Dear {manager_name} and HR Team,

Please accept this letter as formal notification that I am resigning from my position as {designation} in the {department} department.

Last Working Day: {last_working_day}
Notice Period: {notice_period}

I would like to thank the organization for the opportunities provided during my tenure. I will ensure a smooth transition and complete all pending tasks before my last day.

Please let me know the exit formalities and documentation required.

Best regards,
{employee_name}
{employee_code}
{designation}
{department}""",
                "variables": ["employee_name", "employee_code", "designation", "department", "manager_name", "last_working_day", "notice_period", "reason"],
            },
            EmailType.EXIT_ACKNOWLEDGEMENT: {
                "subject": "Exit Formalities - {employee_name}",
                "body": """Dear {employee_name},

We have received your resignation and acknowledge your last working day as {last_working_day}.

Exit Checklist:
- [ ] Asset return (laptop, ID card, access cards)
- [ ] Knowledge transfer documentation
- [ ] Team handover completion
- [ ] Final settlement confirmation
- [ ] Experience / relieving letter request
- [ ] PF/Gratuity/Form 16 submission

Please complete the above formalities by {last_working_day}. For any queries, contact the HR team.

We wish you the best in your future endeavors.

Best regards,
HR Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "designation", "department", "last_working_day", "company_name", "notice_period"],
            },
            EmailType.ATTENDANCE_CORRECTION: {
                "subject": "Attendance Correction Request - {employee_name} - {date}",
                "body": """Dear {manager_name} and HR Team,

I am requesting a correction for my attendance record on {date}.

Current Record: {current_status}
Correct Record: {correct_status}
Check-in: {check_in}
Check-out: {check_out}

Reason for correction: {reason}

I have attached supporting documents (if any). Please approve this correction at your earliest convenience.

Best regards,
{employee_name}
{employee_code}
{department}""",
                "variables": ["employee_name", "employee_code", "department", "manager_name", "date", "current_status", "correct_status", "check_in", "check_out", "reason"],
            },
            EmailType.ATTENDANCE_REGULARIZATION: {
                "subject": "Attendance Regularization Request - {employee_name} - {date}",
                "body": """Dear {manager_name} and HR Team,

I am requesting regularization of my attendance for {date}.

Details:
- Date: {date}
- Missed Check-in: {missed_checkin}
- Missed Check-out: {missed_checkout}
- Reason: {reason}
- Correct Hours: {correct_hours}

I request you to kindly regularize my attendance as per the above details.

Best regards,
{employee_name}
{employee_code}
{department}""",
                "variables": ["employee_name", "employee_code", "department", "manager_name", "date", "missed_checkin", "missed_checkout", "reason", "correct_hours"],
            },
            EmailType.PAYSLIP_GENERATED: {
                "subject": "Payslip Generated - {pay_period} - {employee_name}",
                "body": """Dear {employee_name},

Your payslip for {pay_period} has been generated and is available for download.

Pay Summary:
- Basic Salary: {basic_salary}
- Allowances: {allowances}
- Deductions: {deductions}
- Net Pay: {net_pay}
- Pay Date: {pay_date}

You can download the detailed payslip from the Payroll section of the HRMS portal.

For any queries, contact the payroll team.

Best regards,
Payroll Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "pay_period", "basic_salary", "allowances", "deductions", "net_pay", "pay_date", "company_name"],
            },
            EmailType.WELCOME: {
                "subject": "Welcome to {company_name} - {employee_name}!",
                "body": """Dear {employee_name},

A warm welcome to {company_name}! We are thrilled to have you join us as {designation} in the {department} department.

Your Joining Details:
- Employee Code: {employee_code}
- Designation: {designation}
- Department: {department}
- Reporting Manager: {manager_name}
- Joining Date: {joining_date}

Next Steps:
1. Complete your profile in the HRMS portal
2. Submit required documents (ID proof, address proof, etc.)
3. Collect your laptop and access cards from IT
4. Attend the orientation session on {orientation_date}

We look forward to working with you!

Best regards,
HR Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "designation", "department", "manager_name", "joining_date", "orientation_date", "company_name", "email", "phone"],
            },
            EmailType.ONBOARDING: {
                "subject": "Onboarding Tasks - {employee_name}",
                "body": """Dear {employee_name},

Welcome aboard! Here are your onboarding tasks:

1. Personal Details: Complete your profile in HRMS
2. Documents: Upload ID proof, address proof, and educational certificates
3. IT Setup: Collect laptop and credentials from IT desk
4. Orientation: Attend the mandatory orientation on {orientation_date}
5. Team Introduction: Meet your team members in the {department} department

Please complete the above tasks within {onboarding_deadline} days.

For any assistance, reach out to the HR team.

Best regards,
HR Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "designation", "department", "manager_name", "joining_date", "orientation_date", "onboarding_deadline", "company_name"],
            },
            EmailType.PROBATION_COMPLETION: {
                "subject": "Probation Completion - {employee_name}",
                "body": """Dear {employee_name},

Congratulations! You have successfully completed your probation period.

Details:
- Employee: {employee_name} ({employee_code})
- Department: {department}
- Probation End Date: {probation_end_date}
- Confirmation Date: {confirmation_date}

Your employment is now confirmed as a permanent employee. All benefits and entitlements will be applicable from {confirmation_date}.

Keep up the great work!

Best regards,
HR Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "designation", "department", "probation_end_date", "confirmation_date", "company_name"],
            },
            EmailType.POLICY_UPDATE: {
                "subject": "Policy Update: {policy_title} - {company_name}",
                "body": """Dear All,

This is to inform you about an update to the {policy_title}.

Effective Date: {effective_date}
Version: {version}

Key Changes:
{policy_changes}

Please review the updated policy in the HRMS portal under Policies section. If you have any questions, contact the HR team.

Best regards,
HR Team
{company_name}""",
                "variables": ["policy_title", "effective_date", "version", "policy_changes", "company_name"],
            },
            EmailType.REMINDER: {
                "subject": "Reminder: {reminder_topic} - {company_name}",
                "body": """Dear {recipient_name},

This is a friendly reminder about {reminder_topic}.

Details: {reminder_details}
Action Required: {action_required}
Due Date: {due_date}

Please take the necessary action at your earliest convenience.

Best regards,
{company_name}""",
                "variables": ["recipient_name", "reminder_topic", "reminder_details", "action_required", "due_date", "company_name"],
            },
            EmailType.EXPENSE_CLAIM: {
                "subject": "Expense Claim Submitted - {employee_name} - {expense_type}",
                "body": """Dear {manager_name} and Finance Team,

I have submitted an expense claim for the following:

Expense Details:
- Employee: {employee_name} ({employee_code})
- Department: {department}
- Expense Type: {expense_type}
- Amount: {amount}
- Date: {expense_date}
- Description: {description}
- Receipt: {receipt_url}

Please review and approve this expense claim at your earliest convenience.

Best regards,
{employee_name}
{employee_code}
{department}""",
                "variables": ["employee_name", "employee_code", "department", "manager_name", "expense_type", "amount", "expense_date", "description", "receipt_url"],
            },
            EmailType.ASSET_REQUEST: {
                "subject": "Asset Request - {employee_name} - {asset_type}",
                "body": """Dear IT Team and {manager_name},

I am requesting the following asset:

Asset Details:
- Employee: {employee_name} ({employee_code})
- Department: {department}
- Asset Type: {asset_type}
- Reason: {reason}
- Required By: {required_by_date}

Please process this request at your earliest convenience.

Best regards,
{employee_name}
{employee_code}
{department}""",
                "variables": ["employee_name", "employee_code", "department", "manager_name", "asset_type", "reason", "required_by_date"],
            },
            EmailType.GRIEVANCE_ACKNOWLEDGEMENT: {
                "subject": "Grievance Filed - {employee_name} - {grievance_type}",
                "body": """Dear {employee_name},

We have received your grievance regarding: {grievance_type}

Grievance Details:
- Employee: {employee_name} ({employee_code})
- Department: {department}
- Type: {grievance_type}
- Description: {description}
- Filed Date: {filed_date}

Your grievance has been registered with ID: {grievance_id}. The HR team will review it and get back to you within 3-5 working days.

You can also contact the HR team directly for any urgent matters.

Best regards,
HR Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "grievance_type", "description", "filed_date", "grievance_id", "company_name"],
            },
            EmailType.PERFORMANCE_REVIEW: {
                "subject": "Performance Review - {employee_name}",
                "body": """Dear {employee_name},

It's time for your performance review. Please complete the self-assessment form.

Review Period: {review_period}
Due Date: {due_date}

Please log in to the HRMS portal and complete your self-review under the Performance section.

If you have any questions, contact the HR team.

Best regards,
HR Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "review_period", "due_date", "company_name"],
            },
            EmailType.REFERRAL_ACKNOWLEDGEMENT: {
                "subject": "Employee Referral Received - {candidate_name} - {position}",
                "body": """Dear {employee_name},

Thank you for referring {candidate_name} for the {position} position.

Referral Details:
- Candidate: {candidate_name}
- Position: {position}
- Referred By: {employee_name} ({employee_code})
- Referral Date: {referral_date}

Your referral has been received and will be reviewed by the recruitment team. If the candidate is selected, you will be eligible for the referral bonus as per company policy.

Best regards,
HR Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "candidate_name", "position", "referral_date", "company_name"],
            },
            EmailType.ASSET_ALLOCATION: {
                "subject": "Asset Allocated - {employee_name} - {asset_type}",
                "body": """Dear {employee_name},

Your asset request has been approved. Here are the details:

Asset Details:
- Asset Type: {asset_type}
- Asset ID: {asset_id}
- Serial Number: {serial_number}
- Allocated Date: {allocated_date}
- Return By: {return_date}

Please collect the asset from the IT desk. You are responsible for the safe keeping of this asset.

Best regards,
IT Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "asset_type", "asset_id", "serial_number", "allocated_date", "return_date", "company_name"],
            },
            EmailType.EXPENSE_REIMBURSEMENT: {
                "subject": "Expense Reimbursement Processed - {employee_name}",
                "body": """Dear {employee_name},

Your expense claim has been approved and processed.

Reimbursement Details:
- Expense Type: {expense_type}
- Amount: {amount}
- Payment Date: {payment_date}
- Reference Number: {reference_number}

The amount will be credited to your salary account in the next payroll cycle.

Best regards,
Finance Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "expense_type", "amount", "payment_date", "reference_number", "company_name"],
            },
            EmailType.WARNING_LETTER: {
                "subject": "Warning Letter - {employee_name}",
                "body": """Dear {employee_name},

This letter serves as a formal warning regarding: {reason}

Details of Incident:
- Date: {incident_date}
- Description: {incident_description}
- Policy Violated: {policy_violated}

This is your first warning. Please take corrective action immediately. Further violations may result in disciplinary action.

Acknowledgment: Please sign and return a copy of this letter to HR.

Best regards,
HR Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "reason", "incident_date", "incident_description", "policy_violated", "company_name"],
            },
            EmailType.SHOW_CAUSE_NOTICE: {
                "subject": "Show Cause Notice - {employee_name}",
                "body": """Dear {employee_name},

You are hereby issued a show cause notice for: {reason}

Details:
- Date: {incident_date}
- Description: {incident_description}
- Policy Violated: {policy_violated}

You are required to submit a written explanation to the HR team within {response_deadline} days.

Failure to respond may result in disciplinary action.

Best regards,
HR Team
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "reason", "incident_date", "incident_description", "policy_violated", "response_deadline", "company_name"],
            },
        }
    
    def generate(
        self,
        email_type: EmailType,
        context: Dict[str, Any],
        custom_vars: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Generate an email from template"""
        template = self.templates.get(email_type)
        if not template:
            return {"success": False, "error": f"Unknown email type: {email_type}"}
        
        # Merge context with custom vars
        vars_dict = {**context, **(custom_vars or {})}
        
        # Fill in defaults
        defaults = {
            "company_name": vars_dict.get("company_name", vars_dict.get("organization_name", "Our Organization")),
            "employee_name": vars_dict.get("employee_name", vars_dict.get("name", "Employee")),
            "employee_code": vars_dict.get("employee_code", vars_dict.get("code", "N/A")),
            "designation": vars_dict.get("designation", ""),
            "department": vars_dict.get("department", ""),
            "manager_name": vars_dict.get("manager_name", "Manager"),
        }
        vars_dict = {**defaults, **vars_dict}
        
        # Format subject and body
        subject = template["subject"].format(**vars_dict)
        body = template["body"].format(**vars_dict)
        
        return {
            "success": True,
            "email_type": email_type.value,
            "to": vars_dict.get("to", vars_dict.get("email", "")),
            "cc": vars_dict.get("cc", []),
            "subject": subject,
            "body": body,
            "template_variables": template["variables"],
            "missing_variables": [v for v in template["variables"] if v not in vars_dict],
        }
    
    def get_available_templates(self) -> List[Dict[str, Any]]:
        """Get list of available email templates"""
        return [
            {
                "type": email_type.value,
                "subject_template": template["subject"],
                "variables": template["variables"],
            }
            for email_type, template in self.templates.items()
        ]
    
    def get_template_variables(self, email_type: EmailType) -> List[str]:
        """Get required variables for a template"""
        template = self.templates.get(email_type)
        if template:
            return template["variables"]
        return []


# Singleton
_template_engine: Optional[EmailTemplateEngine] = None


def get_email_template_engine() -> EmailTemplateEngine:
    global _template_engine
    if _template_engine is None:
        _template_engine = EmailTemplateEngine()
    return _template_engine
