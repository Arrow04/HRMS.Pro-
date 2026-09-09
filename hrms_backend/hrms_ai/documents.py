"""
HRMS AI Document Generator
Generates HR documents, forms, and letters
"""
from typing import Dict, Any, List, Optional
from datetime import datetime
from enum import Enum


class DocumentType(str, Enum):
    OFFER_LETTER = "offer_letter"
    APPOINTMENT_LETTER = "appointment_letter"
    EXPERIENCE_LETTER = "experience_letter"
    RELIEVING_LETTER = "relieving_letter"
    SERVICE_CERTIFICATE = "service_certificate"
    SALARY_CERTIFICATE = "salary_certificate"
    TAX_CERTIFICATE = "tax_certificate"
    LEAVE_SANCTION_LETTER = "leave_sanction_letter"
    TRANSFER_ORDER = "transfer_order"
    PROMOTION_LETTER = "promotion_letter"
    WARNING_LETTER = "warning_letter"
    SHOW_CAUSE_NOTICE = "show_cause_notice"
    NOC = "noc"
    BONUS_LETTER = "bonus_letter"
    INCREMENT_LETTER = "increment_letter"
    INTERNSHIP_CERTIFICATE = "internship_certificate"
    EMPLOYMENT_CERTIFICATE = "employment_certificate"


class HRDocumentGenerator:
    """Generates HR documents dynamically"""
    
    def __init__(self):
        self.templates = self._load_templates()
    
    def _load_templates(self) -> Dict[DocumentType, Dict[str, Any]]:
        return {
            DocumentType.OFFER_LETTER: {
                "title": "Offer Letter",
                "subject": "Offer Letter - {position} - {company_name}",
                "body": """{date}

{employee_name}
{address}

Dear {employee_name},

We are pleased to offer you the position of {position} at {company_name}. We believe your skills and experience will be valuable to our team.

Position Details:
- Designation: {position}
- Department: {department}
- Reporting Manager: {manager_name}
- Location: {location}
- Employment Type: {employment_type}
- Joining Date: {joining_date}

Compensation:
- CTC: {ctc} per annum
- Basic Salary: {basic_salary} per month
- Allowances: {allowances}

Terms and Conditions:
1. You will be on probation for {probation_period} months
2. During probation, either party may terminate the employment with {notice_period} notice
3. After confirmation, standard notice period applies
4. You will be bound by the company's policies and code of conduct

Please confirm your acceptance by signing and returning this letter by {acceptance_deadline}.

Welcome to the {company_name} team!

Best regards,
{hr_manager_name}
Human Resources
{company_name}""",
                "variables": ["employee_name", "address", "position", "company_name", "department", "manager_name", "location", "employment_type", "joining_date", "ctc", "basic_salary", "allowances", "probation_period", "notice_period", "acceptance_deadline", "hr_manager_name", "date"],
            },
            DocumentType.APPOINTMENT_LETTER: {
                "title": "Appointment Letter",
                "subject": "Appointment Letter - {employee_name}",
                "body": """{date}

{employee_name}
{address}

Dear {employee_name},

Following your acceptance of the offer dated {offer_date}, we are pleased to confirm your appointment as {position} in the {department} department.

Appointment Details:
- Employee Code: {employee_code}
- Designation: {position}
- Department: {department}
- Reporting Manager: {manager_name}
- Location: {location}
- Employment Type: {employment_type}
- Date of Joining: {joining_date}

Compensation Package:
- CTC: {ctc} per annum
- Basic Salary: {basic_salary} per month
- HRA: {hra} per month
- Special Allowance: {special_allowance} per month
- Other Allowances: {other_allowances}

Please report to the HR office on {joining_date} with the following documents:
1. Identity proof (Aadhar, PAN, Passport)
2. Address proof
3. Educational certificates
4. Previous employment documents
5. Passport size photographs

Welcome aboard!

Best regards,
{hr_manager_name}
Human Resources
{company_name}""",
                "variables": ["employee_name", "address", "position", "company_name", "department", "manager_name", "location", "employment_type", "joining_date", "ctc", "basic_salary", "hra", "special_allowance", "other_allowances", "employee_code", "offer_date", "hr_manager_name", "date"],
            },
            DocumentType.EXPERIENCE_LETTER: {
                "title": "Experience Letter",
                "subject": "Experience Letter - {employee_name}",
                "body": """{date}

To Whom It May Concern,

This is to certify that {employee_name} (Employee Code: {employee_code}) was employed with {company_name} as {position} in the {department} department from {join_date} to {exit_date}.

During this period, {employee_name} has demonstrated:
- Professionalism and dedication to work
- Strong technical and interpersonal skills
- Ability to work effectively in a team environment
- Commitment to organizational goals

We appreciate {employee_name}'s contributions to the organization and wish {gender_pronoun} all the best for future endeavors.

For any further verification, please contact:
{hr_manager_name}
Human Resources
{company_name}
{company_email}
{company_phone}

Best regards,
{hr_manager_name}
Human Resources
{company_name}""",
                "variables": ["employee_name", "employee_code", "position", "company_name", "department", "join_date", "exit_date", "gender_pronoun", "hr_manager_name", "company_email", "company_phone", "date"],
            },
            DocumentType.RELIEVING_LETTER: {
                "title": "Relieving Letter",
                "subject": "Relieving Letter - {employee_name}",
                "body": """{date}

To Whom It May Concern,

This is to certify that {employee_name} (Employee Code: {employee_code}) has been relieved from the services of {company_name} effective {exit_date}.

Employment Details:
- Employee: {employee_name}
- Employee Code: {employee_code}
- Position: {position}
- Department: {department}
- Tenure: {join_date} to {exit_date}
- Last Working Day: {last_working_day}

All dues have been settled and company property has been returned.

We wish {gender_pronoun} success in future endeavors.

Best regards,
{hr_manager_name}
Human Resources
{company_name}""",
                "variables": ["employee_name", "employee_code", "position", "company_name", "department", "join_date", "exit_date", "last_working_day", "gender_pronoun", "hr_manager_name", "date"],
            },
            DocumentType.SALARY_CERTIFICATE: {
                "title": "Salary Certificate",
                "subject": "Salary Certificate - {employee_name} - {period}",
                "body": """{date}

To Whom It May Concern,

This is to certify that {employee_name} (Employee Code: {employee_code}) is employed with {company_name} as {position}.

Salary Details for {period}:
- Basic Salary: {basic_salary}
- HRA: {hra}
- Special Allowance: {special_allowance}
- Other Allowances: {other_allowances}
- Gross Salary: {gross_salary}
- Deductions: {deductions}
- Net Salary: {net_salary}

Employment Type: {employment_type}
Department: {department}
Joining Date: {join_date}

This certificate is issued upon request for {purpose}.

Best regards,
{hr_manager_name}
Human Resources
{company_name}""",
                "variables": ["employee_name", "employee_code", "position", "company_name", "department", "period", "basic_salary", "hra", "special_allowance", "other_allowances", "gross_salary", "deductions", "net_salary", "employment_type", "join_date", "purpose", "hr_manager_name", "date"],
            },
            DocumentType.LEAVE_SANCTION_LETTER: {
                "title": "Leave Sanction Letter",
                "subject": "Leave Sanction Letter - {employee_name}",
                "body": """{date}

{employee_name}
{employee_code}
{department}

Dear {employee_name},

Your leave application dated {application_date} has been approved.

Leave Details:
- Leave Type: {leave_type}
- From: {start_date}
- To: {end_date}
- Total Days: {total_days}
- Approved By: {approved_by}
- Approval Date: {approval_date}

Please ensure a smooth handover of your responsibilities before proceeding on leave.

Best regards,
{hr_manager_name}
Human Resources
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "application_date", "leave_type", "start_date", "end_date", "total_days", "approved_by", "approval_date", "hr_manager_name", "company_name", "date"],
            },
            DocumentType.TRANSFER_ORDER: {
                "title": "Transfer Order",
                "subject": "Transfer Order - {employee_name}",
                "body": """{date}

{employee_name}
{employee_code}
{department}

Dear {employee_name},

This is to inform you that you have been transferred as per organizational requirements.

Transfer Details:
- From: {from_department}, {from_location}
- To: {to_department}, {to_location}
- Effective Date: {effective_date}
- Reporting Manager: {new_manager_name}

Please report to the new location by {effective_date}. All your benefits and entitlements will remain unchanged.

Best regards,
{hr_manager_name}
Human Resources
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "from_department", "from_location", "to_department", "to_location", "effective_date", "new_manager_name", "hr_manager_name", "company_name", "date"],
            },
            DocumentType.PROMOTION_LETTER: {
                "title": "Promotion Letter",
                "subject": "Congratulations! Promotion to {new_designation} - {employee_name}",
                "body": """{date}

{employee_name}
{employee_code}
{department}

Dear {employee_name},

We are pleased to inform you that you have been promoted to {new_designation} effective {effective_date}.

Promotion Details:
- Previous Designation: {old_designation}
- New Designation: {new_designation}
- Department: {department}
- New CTC: {new_ctc}
- Effective Date: {effective_date}

This promotion is in recognition of your outstanding performance and contributions to the organization.

Congratulations and keep up the great work!

Best regards,
{hr_manager_name}
Human Resources
{company_name}""",
                "variables": ["employee_name", "employee_code", "department", "old_designation", "new_designation", "new_ctc", "effective_date", "hr_manager_name", "company_name", "date"],
            },
            DocumentType.INTERNSHIP_CERTIFICATE: {
                "title": "Internship Certificate",
                "subject": "Internship Certificate - {employee_name}",
                "body": """{date}

To Whom It May Concern,

This is to certify that {employee_name} (Employee Code: {employee_code}) has successfully completed an internship at {company_name} from {join_date} to {exit_date}.

Internship Details:
- Department: {department}
- Position: {designation}
- Duration: {join_date} to {exit_date}
- Performance: Satisfactory

We appreciate {gender_pronoun} contributions during the internship period and wish {gender_pronoun} success in future endeavors.

Best regards,
{hr_manager_name}
Human Resources
{company_name}""",
                "variables": ["employee_name", "employee_code", "designation", "company_name", "department", "join_date", "exit_date", "gender_pronoun", "hr_manager_name", "date"],
            },
            DocumentType.EMPLOYMENT_CERTIFICATE: {
                "title": "Employment Certificate",
                "subject": "Employment Certificate - {employee_name}",
                "body": """{date}

To Whom It May Concern,

This is to certify that {employee_name} (Employee Code: {employee_code}) is currently employed with {company_name} as {designation} in the {department} department.

Employment Details:
- Employee: {employee_name}
- Employee Code: {employee_code}
- Designation: {designation}
- Department: {department}
- Joining Date: {join_date}
- Employment Type: {employment_type}

This certificate is issued upon request for {purpose}.

Best regards,
{hr_manager_name}
Human Resources
{company_name}""",
                "variables": ["employee_name", "employee_code", "designation", "company_name", "department", "join_date", "employment_type", "purpose", "hr_manager_name", "date"],
            },
        }
    
    def generate(
        self,
        document_type: DocumentType,
        context: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Generate a document from template"""
        template = self.templates.get(document_type)
        if not template:
            return {"success": False, "error": f"Unknown document type: {document_type}"}
        
        # Fill in defaults
        defaults = {
            "company_name": context.get("company_name", context.get("organization_name", "Our Organization")),
            "employee_name": context.get("employee_name", context.get("name", "Employee")),
            "employee_code": context.get("employee_code", "N/A"),
            "designation": context.get("designation", ""),
            "department": context.get("department", ""),
            "manager_name": context.get("manager_name", "Manager"),
            "date": context.get("date", datetime.now().strftime("%B %d, %Y")),
            "gender_pronoun": context.get("gender_pronoun", "them"),
        }
        
        merged = {**defaults, **context}
        
        # Format document
        subject = template["subject"].format(**merged)
        body = template["body"].format(**merged)
        
        return {
            "success": True,
            "document_type": document_type.value,
            "title": template["title"],
            "subject": subject,
            "body": body,
            "variables_used": list(merged.keys()),
            "missing_variables": [v for v in template["variables"] if v not in merged],
        }
    
    def get_available_documents(self) -> List[Dict[str, Any]]:
        """Get list of available document types"""
        return [
            {
                "type": doc_type.value,
                "title": template["title"],
                "variables": template["variables"],
            }
            for doc_type, template in self.templates.items()
        ]


# Singleton
_document_generator: Optional[HRDocumentGenerator] = None


def get_document_generator() -> HRDocumentGenerator:
    global _document_generator
    if _document_generator is None:
        _document_generator = HRDocumentGenerator()
    return _document_generator
