from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from functools import lru_cache

from core.datetime_utils import ist_now_naive
import json

from database import get_db
from models import LookupCategory, LookupValue, TerminationType, User
from core.auth import require_superadmin, get_current_user
from core.cache import get_redis, invalidate_master_data_caches, make_key

class LazyRedisClient:
    """Proxy to a module-level Redis client that gracefully degrades when Redis is unavailable."""

    def _get_client(self):
        try:
            from core.cache import get_redis
            return get_redis()
        except Exception:
            return None

    def __getattr__(self, name):
        client = self._get_client()
        if client is not None:
            return getattr(client, name)
        raise AttributeError(f"Redis client unavailable: no attribute '{name}'")

    def __bool__(self):
        """Return True only if Redis is actually reachable (not just initialised)."""
        client = self._get_client()
        if client is None:
            return False
        try:
            client.ping()
            return True
        except Exception:
            return False

redis_client = LazyRedisClient()

router = APIRouter(tags=["Master Data"])

# Default master data configuration
DEFAULT_MASTER_DATA = {    "employee": [
        {
            "code": "GENDER",
            "name": "Gender",
            "description": "Employee gender options",
            "icon": "Users",
            "values": [
                {"code": "male", "name": "Male", "description": "Male gender"},
                {"code": "female", "name": "Female", "description": "Female gender"},
                {"code": "other", "name": "Other", "description": "Other gender"}
            ]
        },
        {
            "code": "EMP_STATUS",
            "name": "Employee Status",
            "description": "Employee employment status",
            "icon": "UserCheck",
            "values": [
                {"code": "active", "name": "Operational", "description": "Operational employee"},
                {"code": "shortlisted", "name": "Shortlisted", "description": "Selected for hiring, pending onboarding"},
                {"code": "inactive", "name": "Non-Operational", "description": "Non-operational employee"},
                {"code": "on_leave", "name": "On Leave", "description": "Employee on leave"},
                {"code": "terminated", "name": "Terminated", "description": "Terminated employee"}
            ]
        },
        {
            "code": "BLOOD_GROUP",
            "name": "Blood Group",
            "description": "Blood group types",
            "icon": "Droplet",
            "values": [
                {"code": "A+", "name": "A+", "description": "Blood group A positive"},
                {"code": "A-", "name": "A-", "description": "Blood group A negative"},
                {"code": "B+", "name": "B+", "description": "Blood group B positive"},
                {"code": "B-", "name": "B-", "description": "Blood group B negative"},
                {"code": "AB+", "name": "AB+", "description": "Blood group AB positive"},
                {"code": "AB-", "name": "AB-", "description": "Blood group AB negative"},
                {"code": "O+", "name": "O+", "description": "Blood group O positive"},
                {"code": "O-", "name": "O-", "description": "Blood group O negative"}
            ]
        },
        {
            "code": "EMPLOYMENT_TYPE",
            "name": "Employment Type",
            "description": "Types of employment",
            "icon": "Briefcase",
            "values": [
                {"code": "full_time", "name": "Full Time", "description": "Full time employment"},
                {"code": "part_time", "name": "Part Time", "description": "Part time employment"},
                {"code": "contract", "name": "Contract", "description": "Contract employment"},
                {"code": "intern", "name": "Intern", "description": "Internship"}
            ]
        },
        {
            "code": "MARITAL_STATUS",
            "name": "Marital Status",
            "description": "Marital status options",
            "icon": "Heart",
            "values": [
                {"code": "single", "name": "Single", "description": "Single"},
                {"code": "married", "name": "Married", "description": "Married"},
                {"code": "divorced", "name": "Divorced", "description": "Divorced"},
                {"code": "widowed", "name": "Widowed", "description": "Widowed"}
            ]
        },
        {
            "code": "EDUCATION_LEVEL",
            "name": "Education Level",
            "description": "Educational qualification levels",
            "icon": "GraduationCap",
            "values": [
                {"code": "high_school", "name": "High School", "description": "High School diploma"},
                {"code": "diploma", "name": "Diploma", "description": "Diploma"},
                {"code": "bachelor", "name": "Bachelor's Degree", "description": "Bachelor's degree"},
                {"code": "master", "name": "Master's Degree", "description": "Master's degree"},
                {"code": "phd", "name": "PhD", "description": "Doctorate degree"},
                {"code": "other", "name": "Other", "description": "Other qualification"}
            ]
        },
        {
            "code": "EMPLOYEE_DEVICE_TYPE",
            "name": "Employee Device Type",
            "description": "Device types for employees",
            "icon": "Laptop",
            "values": [
                {"code": "laptop", "name": "Laptop", "description": "Laptop computer"},
                {"code": "desktop", "name": "Desktop", "description": "Desktop computer"},
                {"code": "mobile", "name": "Mobile", "description": "Mobile device"},
                {"code": "tablet", "name": "Tablet", "description": "Tablet device"}
            ]
        },
        {
            "code": "ACTIVITY_TYPE",
            "name": "Activity Type",
            "description": "Extra curricular activity types",
            "icon": "Activity",
            "values": [
                {"code": "sports", "name": "Sports", "description": "Sports activities"},
                {"code": "arts", "name": "Arts & Culture", "description": "Arts and cultural activities"},
                {"code": "volunteering", "name": "Volunteering", "description": "Volunteering activities"},
                {"code": "leadership", "name": "Leadership", "description": "Leadership activities"},
                {"code": "other", "name": "Other", "description": "Other activities"}
            ]
        },
        {
            "code": "SKILL_PROFICIENCY",
            "name": "Skill Proficiency",
            "description": "Skill proficiency levels",
            "icon": "Award",
            "values": [
                {"code": "beginner", "name": "Beginner", "description": "Basic level"},
                {"code": "intermediate", "name": "Intermediate", "description": "Working level"},
                {"code": "advanced", "name": "Advanced", "description": "Advanced level"},
                {"code": "expert", "name": "Expert", "description": "Expert level"}
            ]
        }
    ],
    "leave": [
        {
            "code": "LEAVE_TYPE",
            "name": "Leave Type",
            "description": "Types of leave",
            "icon": "Calendar",
            "values": [
                {"code": "sick_leave", "name": "Sick Leave", "description": "Sick leave"},
                {"code": "vacation", "name": "Vacation", "description": "Vacation leave"},
                {"code": "personal", "name": "Personal", "description": "Personal leave"},
                {"code": "maternity", "name": "Maternity", "description": "Maternity leave"},
                {"code": "paternity", "name": "Paternity", "description": "Paternity leave"}
            ]
        },
        {
            "code": "LEAVE_PURPOSE",
            "name": "Leave Purpose",
            "description": "Purpose of leave",
            "icon": "Info",
            "values": [
                {"code": "medical", "name": "Medical", "description": "Medical purpose"},
                {"code": "personal", "name": "Personal", "description": "Personal purpose"},
                {"code": "family", "name": "Family", "description": "Family purpose"},
                {"code": "emergency", "name": "Emergency", "description": "Emergency purpose"},
                {"code": "vacation", "name": "Vacation", "description": "Vacation purpose"},
                {"code": "other", "name": "Other", "description": "Other purpose"}
            ]
        },
        {
            "code": "LEAVE_STATUS",
            "name": "Leave Status",
            "description": "Leave request status options",
            "icon": "Clock",
            "values": [
                {"code": "pending", "name": "Pending", "description": "Leave request pending approval"},
                {"code": "reviewing", "name": "Reviewing", "description": "Leave request under review"},
                {"code": "approved", "name": "Approved", "description": "Leave request approved"},
                {"code": "rejected", "name": "Rejected", "description": "Leave request rejected"}
            ]
        }
    ],
    "attendance": [
        {
            "code": "ATTENDANCE_DEVICE_TYPE",
            "name": "Attendance Device Type",
            "description": "Device types for attendance",
            "icon": "Laptop",
            "values": [
                {"code": "web", "name": "Web", "description": "Web browser"},
                {"code": "mobile", "name": "Mobile", "description": "Mobile device"},
                {"code": "biometric", "name": "Biometric", "description": "Biometric device"},
                {"code": "kiosk", "name": "Kiosk", "description": "Kiosk terminal"}
            ]
        },
        {
            "code": "ATTENDANCE_STATUS",
            "name": "Attendance Status",
            "description": "Attendance status options",
            "icon": "Clock",
            "values": [
                {"code": "present", "name": "Present", "description": "Present"},
                {"code": "late", "name": "Late", "description": "Late arrival"},
                {"code": "absent", "name": "Absent", "description": "Absent"},
                {"code": "half_day", "name": "Half Day", "description": "Half day"},
                {"code": "work_from_home", "name": "Work From Home", "description": "Working from home"},
                {"code": "on_leave", "name": "On Leave", "description": "On leave"},
                {"code": "week_off", "name": "Week Off", "description": "Weekly off day"}
            ]
        },
        {
            "code": "DUTY_SHIFT",
            "name": "Duty Shift",
            "description": "Work shift schedules with time ranges",
            "icon": "Clock",
            "values": [
                {"code": "morning", "name": "Morning Shift", "description": "6:00 AM - 2:00 PM"},
                {"code": "day", "name": "Day Shift", "description": "9:00 AM - 5:00 PM"},
                {"code": "evening", "name": "Evening Shift", "description": "2:00 PM - 10:00 PM"},
                {"code": "night", "name": "Night Shift", "description": "10:00 PM - 6:00 AM"}
            ]
        },
        {
            "code": "DUTY_ROSTER",
            "name": "Duty Roster",
            "description": "Weekly duty roster days",
            "icon": "Calendar",
            "values": [
                {"code": "monday", "name": "Monday", "description": "Monday duty"},
                {"code": "tuesday", "name": "Tuesday", "description": "Tuesday duty"},
                {"code": "wednesday", "name": "Wednesday", "description": "Wednesday duty"},
                {"code": "thursday", "name": "Thursday", "description": "Thursday duty"},
                {"code": "friday", "name": "Friday", "description": "Friday duty"},
                {"code": "saturday", "name": "Saturday", "description": "Saturday duty"},
                {"code": "sunday", "name": "Sunday", "description": "Sunday duty"}
            ]
        },
        {
            "code": "SHIFT_TYPE",
            "name": "Shift Type",
            "description": "Shift type classification",
            "icon": "Clock",
            "values": [
                {"code": "morning", "name": "Morning", "description": "Morning shift"},
                {"code": "evening", "name": "Evening", "description": "Evening shift"},
                {"code": "night", "name": "Night", "description": "Night shift"},
                {"code": "general", "name": "General", "description": "General shift"}
            ]
        }
    ],
    "holiday": [
        {
            "code": "HOLIDAY_TYPE",
            "name": "Holiday Type",
            "description": "Types of holidays",
            "icon": "Sun",
            "values": [
                {"code": "public", "name": "Public", "description": "Public holiday"},
                {"code": "company", "name": "Company", "description": "Company holiday"},
                {"code": "optional", "name": "Optional", "description": "Optional holiday"}
            ]
        },
        {
            "code": "IS_PAID_HOLIDAY",
            "name": "Is Paid Holiday",
            "description": "Whether holiday is paid",
            "icon": "Coins",
            "values": [
                {"code": "yes", "name": "Yes", "description": "Paid holiday"},
                {"code": "no", "name": "No", "description": "Unpaid holiday"}
            ]
        },
        {
            "code": "IS_RECURRING",
            "name": "Is Recurring",
            "description": "Whether holiday repeats",
            "icon": "RefreshCw",
            "values": [
                {"code": "yes", "name": "Yes", "description": "Recurring holiday"},
                {"code": "no", "name": "No", "description": "One-time holiday"}
            ]
        },
        {
            "code": "RECURRING_PATTERN",
            "name": "Recurring Pattern",
            "description": "Holiday recurrence pattern",
            "icon": "Calendar",
            "values": [
                {"code": "yearly", "name": "Yearly", "description": "Repeats yearly"},
                {"code": "monthly", "name": "Monthly", "description": "Repeats monthly"},
                {"code": "weekly", "name": "Weekly", "description": "Repeats weekly"}
            ]
        },
        {
            "code": "IS_WORKING_DAY",
            "name": "Is Working Day",
            "description": "Whether holiday is a working day",
            "icon": "Briefcase",
            "values": [
                {"code": "active", "name": "Active", "description": "Schedule is running"},
                {"code": "inactive", "name": "Inactive", "description": "Schedule is paused"}
            ]
        },
        {
            "code": "ROLES",
            "name": "Roles",
            "description": "User roles in the system",
            "icon": "Shield",
            "values": [
                {"code": "superadmin", "name": "Super Admin", "description": "Platform administrator"},
                {"code": "admin", "name": "Admin", "description": "Organization administrator"},
                {"code": "hr_admin", "name": "HR Admin", "description": "HR administrator"},
                {"code": "hr_manager", "name": "HR Manager", "description": "HR manager"},
                {"code": "hr_executive", "name": "HR Executive", "description": "HR executive"},
                {"code": "employee", "name": "Employee", "description": "Regular employee"}
            ]
        },
        {
            "code": "AUDIT_MODULE",
            "name": "Audit Module",
            "description": "Modules tracked in audit logs",
            "icon": "ClipboardList",
            "values": [
                {"code": "employee", "name": "Employee", "description": "Employee module"},
                {"code": "company", "name": "Company", "description": "Company module"},
                {"code": "attendance", "name": "Attendance", "description": "Attendance module"},
                {"code": "leave", "name": "Leave", "description": "Leave module"},
                {"code": "expenses", "name": "Expenses", "description": "Expenses module"},
                {"code": "payroll", "name": "Payroll", "description": "Payroll module"},
                {"code": "performance", "name": "Performance", "description": "Performance module"},
                {"code": "settings", "name": "Settings", "description": "Settings module"},
                {"code": "master_data", "name": "Master Data", "description": "Master data module"},
                {"code": "reports", "name": "Reports", "description": "Reports module"}
            ]
        },
        {
            "code": "AUDIT_ACTION",
            "name": "Audit Action",
            "description": "Actions tracked in audit logs",
            "icon": "ListChecks",
            "values": [
                {"code": "create", "name": "Create", "description": "Record created"},
                {"code": "update", "name": "Update", "description": "Record updated"},
                {"code": "delete", "name": "Delete", "description": "Record deleted"},
                {"code": "login", "name": "Login", "description": "User logged in"},
                {"code": "logout", "name": "Logout", "description": "User logged out"},
                {"code": "export", "name": "Export", "description": "Data exported"}
            ]
        },
        {
            "code": "MODULES",
            "name": "Modules",
            "description": "Available application modules",
            "icon": "LayoutDashboard",
            "values": [
                {"code": "dashboard", "name": "Dashboard", "description": "Dashboard module"},
                {"code": "company", "name": "Company", "description": "Company module"},
                {"code": "employees", "name": "Employees", "description": "Employees module"},
                {"code": "recruitment", "name": "Recruitment", "description": "Recruitment module"},
                {"code": "holidays", "name": "Holidays", "description": "Holidays module"},
                {"code": "attendance", "name": "Attendance", "description": "Attendance module"},
                {"code": "leaves", "name": "Leaves", "description": "Leaves module"},
                {"code": "payroll", "name": "Payroll", "description": "Payroll module"},
                {"code": "expenses", "name": "Expenses", "description": "Expenses module"},
                {"code": "performance", "name": "Performance", "description": "Performance module"},
                {"code": "reports", "name": "Reports", "description": "Reports module"},
                {"code": "settings", "name": "Settings", "description": "Settings module"}
            ]
        },
        {
            "code": "TRANSFER_TYPE",
            "name": "Transfer Type",
            "description": "Employee transfer types",
            "icon": "ArrowRightLeft",
            "values": [
                {"code": "permanent", "name": "Permanent", "description": "Permanent transfer"},
                {"code": "temporary", "name": "Temporary", "description": "Temporary transfer"},
                {"code": "promotion", "name": "Promotion", "description": "Promotional transfer"},
                {"code": "transfer", "name": "Transfer", "description": "Horizontal transfer"},
                {"code": "demotion", "name": "Demotion", "description": "Demotional transfer"},
                {"code": "department_change", "name": "Department Change", "description": "Change of department"}
            ]
        },
        {
            "code": "ANOMALY_SEVERITY",
            "name": "Anomaly Severity",
            "description": "Severity levels for anomaly alerts",
            "icon": "AlertTriangle",
            "values": [
                {"code": "low", "name": "Low", "description": "Low severity"},
                {"code": "medium", "name": "Medium", "description": "Medium severity"},
                {"code": "high", "name": "High", "description": "High severity"},
                {"code": "critical", "name": "Critical", "description": "Critical severity"}
            ]
        },
        {
            "code": "ANOMALY_TYPE",
            "name": "Anomaly Type",
            "description": "Types of anomaly alerts",
            "icon": "AlertCircle",
            "values": [
                {"code": "attendance", "name": "Attendance", "description": "Attendance anomaly"},
                {"code": "payroll", "name": "Payroll", "description": "Payroll anomaly"},
                {"code": "leave", "name": "Leave", "description": "Leave anomaly"},
                {"code": "expense", "name": "Expense", "description": "Expense anomaly"},
                {"code": "login", "name": "Login", "description": "Login anomaly"}
            ]
        },
        {
            "code": "ANOMALY_STATUS",
            "name": "Anomaly Status",
            "description": "Status of anomaly alerts",
            "icon": "ToggleRight",
            "values": [
                {"code": "open", "name": "Open", "description": "Alert open"},
                {"code": "in_review", "name": "In Review", "description": "Being reviewed"},
                {"code": "resolved", "name": "Resolved", "description": "Alert resolved"},
                {"code": "dismissed", "name": "Dismissed", "description": "Alert dismissed"}
            ]
        },
        {
            "code": "INTERVIEW_TYPE",
            "name": "Interview Type",
            "description": "Types of interviews",
            "icon": "Users",
            "values": [
                {"code": "telephonic", "name": "Telephonic", "description": "Phone interview"},
                {"code": "video", "name": "Video", "description": "Video interview"},
                {"code": "face_to_face", "name": "Face to Face", "description": "In-person interview"},
                {"code": "panel", "name": "Panel", "description": "Panel interview"}
            ]
        },
        {
            "code": "INTERVIEW_ROUND",
            "name": "Interview Round",
            "description": "Rounds of interview",
            "icon": "ListOrdered",
            "values": [
                {"code": "round_1", "name": "Initial Round", "description": "Initial screening round"},
                {"code": "round_2", "name": "Technical Round", "description": "Technical round"},
                {"code": "round_3", "name": "HR Round", "description": "HR round"},
                {"code": "final", "name": "Final Round", "description": "Final round"}
            ]
        }
    ],
    "expense": [
        {
            "code": "EXPENSE_CATEGORY",
            "name": "Expense Category",
            "description": "Expense categories",
            "icon": "Receipt",
            "values": [
                {"code": "travel", "name": "Travel", "description": "Travel expenses"},
                {"code": "meals", "name": "Meals", "description": "Meal expenses"},
                {"code": "office", "name": "Office", "description": "Office supplies"},
                {"code": "other", "name": "Other", "description": "Other expenses"}
            ]
        },
        {
            "code": "PAYMENT_METHOD",
            "name": "Payment Method",
            "description": "Payment methods for expenses",
            "icon": "CreditCard",
            "values": [
                {"code": "cash", "name": "Cash", "description": "Cash payment"},
                {"code": "card", "name": "Card", "description": "Credit/Debit card"},
                {"code": "transfer", "name": "Bank Transfer", "description": "Bank transfer"},
                {"code": "check", "name": "Check", "description": "Check payment"}
            ]
        },
        {
            "code": "TAX_INCLUSIVE",
            "name": "Tax Inclusive",
            "description": "Whether expense includes tax",
            "icon": "Percent",
            "values": [
                {"code": "yes", "name": "Yes", "description": "Tax included"},
                {"code": "no", "name": "No", "description": "Tax excluded"}
            ]
        },
        {
            "code": "BILLABLE_TO_CLIENT",
            "name": "Billable to Client",
            "description": "Whether expense is billable to client",
            "icon": "DollarSign",
            "values": [
                {"code": "yes", "name": "Yes", "description": "Billable to client"},
                {"code": "no", "name": "No", "description": "Not billable"}
            ]
        },
        {
            "code": "EXPENSE_STATUS",
            "name": "Expense Status",
            "description": "Expense request status",
            "icon": "Clock",
            "values": [
                {"code": "pending", "name": "Pending", "description": "Expense pending approval"},
                {"code": "approved", "name": "Approved", "description": "Expense approved"},
                {"code": "rejected", "name": "Rejected", "description": "Expense rejected"}
            ]
        }
    ],
    "company": [
        {
            "code": "ORG_STATUS",
            "name": "Organization Status",
            "description": "Organization status",
            "icon": "Building2",
            "values": [
                {"code": "active", "name": "Operational", "description": "Operational organization"},
                {"code": "inactive", "name": "Non-Operational", "description": "Non-operational organization"}
            ]
        },
        {
            "code": "INDUSTRY",
            "name": "Industry",
            "description": "Company industry types",
            "icon": "Building",
            "values": [
                {"code": "technology", "name": "Technology", "description": "Technology industry"},
                {"code": "healthcare", "name": "Healthcare", "description": "Healthcare industry"},
                {"code": "finance", "name": "Finance", "description": "Finance industry"},
                {"code": "manufacturing", "name": "Manufacturing", "description": "Manufacturing industry"},
                {"code": "retail", "name": "Retail", "description": "Retail industry"},
                {"code": "education", "name": "Education", "description": "Education industry"},
                {"code": "other", "name": "Other", "description": "Other industry"}
            ]
        },
        {
            "code": "COMPANY_SIZE",
            "name": "Company Size",
            "description": "Company size by employee count",
            "icon": "Users",
            "values": [
                {"code": "1-50", "name": "1-50 employees", "description": "Small company"},
                {"code": "50-200", "name": "50-200 employees", "description": "Medium company"},
                {"code": "200-1000", "name": "200-1000 employees", "description": "Large company"},
                {"code": "1000+", "name": "1000+ employees", "description": "Enterprise company"}
            ]
        },
        {
            "code": "GRADE",
            "name": "Grade",
            "description": "Employee grade levels",
            "icon": "GraduationCap",
            "values": [
                {"code": "grade_a", "name": "Grade A", "description": "Executive Level"},
                {"code": "grade_b", "name": "Grade B", "description": "VP Level"},
                {"code": "grade_c", "name": "Grade C", "description": "Director Level"},
                {"code": "grade_d", "name": "Grade D", "description": "Senior Manager Level"},
                {"code": "grade_e", "name": "Grade E", "description": "Manager Level"},
                {"code": "grade_f", "name": "Grade F", "description": "Lead Level"},
                {"code": "grade_g", "name": "Grade G", "description": "Senior Level"},
                {"code": "grade_h", "name": "Grade H", "description": "Mid Level"},
                {"code": "grade_i", "name": "Grade I", "description": "Junior Level"},
                {"code": "grade_j", "name": "Grade J", "description": "Entry Level"}
            ]
        }
    ],
    "settings": [
        {
            "code": "LANGUAGE",
            "name": "Language",
            "description": "System language options",
            "icon": "Globe",
            "values": [
                {"code": "en", "name": "English", "description": "English language"},
                {"code": "hi", "name": "Hindi", "description": "Hindi language"},
                {"code": "ta", "name": "Tamil", "description": "Tamil language"},
                {"code": "es", "name": "Spanish", "description": "Spanish language"},
                {"code": "fr", "name": "French", "description": "French language"},
                {"code": "de", "name": "German", "description": "German language"}
            ]
        },
        {
            "code": "PAYROLL_CYCLE",
            "name": "Payroll Cycle",
            "description": "Payroll processing frequency",
            "icon": "RefreshCw",
            "values": [
                {"code": "monthly", "name": "Monthly", "description": "Monthly payroll"},
                {"code": "bi-weekly", "name": "Bi-weekly", "description": "Bi-weekly payroll"},
                {"code": "weekly", "name": "Weekly", "description": "Weekly payroll"}
            ]
        },
        {
            "code": "PAY_DAY",
            "name": "Pay Day",
            "description": "Payroll processing day",
            "icon": "CalendarCheck",
            "values": [
                {"code": "last-day", "name": "Last day of month", "description": "Pay on last day"},
                {"code": "1st", "name": "1st of month", "description": "Pay on 1st"},
                {"code": "15th", "name": "15th of month", "description": "Pay on 15th"},
                {"code": "25th", "name": "25th of month", "description": "Pay on 25th"}
            ]
        },
        {
            "code": "REVIEW_FREQUENCY",
            "name": "Review Frequency",
            "description": "Performance review frequency setting",
            "icon": "BarChart3",
            "values": [
                {"code": "annual", "name": "Annual", "description": "Annual reviews"},
                {"code": "half-yearly", "name": "Half-yearly", "description": "Half-yearly reviews"},
                {"code": "quarterly", "name": "Quarterly", "description": "Quarterly reviews"}
            ]
        },
        {
            "code": "RATING_SCALE",
            "name": "Rating Scale",
            "description": "Performance rating scale",
            "icon": "Star",
            "values": [
                {"code": "1-5", "name": "1-5 stars", "description": "5 point scale"},
                {"code": "1-10", "name": "1-10 scale", "description": "10 point scale"},
                {"code": "exceeds-meets-below", "name": "Exceeds/Meets/Below", "description": "3 level scale"}
            ]
        },
        {
            "code": "ROSTER_ASSIGN_LEVEL",
            "name": "Roster Assign Level",
            "description": "Level at which duty rosters are assigned",
            "icon": "CalendarClock",
            "values": [
                {"code": "company", "name": "Company-wise", "description": "Assign by company"},
                {"code": "branch", "name": "Branch-wise", "description": "Assign by branch"},
                {"code": "department", "name": "Department-wise", "description": "Assign by department"},
                {"code": "employee", "name": "Employee-wise", "description": "Assign by employee"}
            ]
        },
        {
            "code": "WORKING_DAYS_PER_WEEK",
            "name": "Working Days per Week",
            "description": "Standard working days in a week",
            "icon": "CalendarDays",
            "values": [
                {"code": "5", "name": "5 Days", "description": "Monday to Friday"},
                {"code": "6", "name": "6 Days", "description": "Monday to Saturday"}
            ]
        },
        {
            "code": "REPORT_FREQUENCY",
            "name": "Report Frequency",
            "description": "How often a scheduled report runs",
            "icon": "RefreshCw",
            "values": [
                {"code": "daily", "name": "Daily", "description": "Runs every day"},
                {"code": "weekly", "name": "Weekly", "description": "Runs every week"},
                {"code": "bi_weekly", "name": "Bi-weekly", "description": "Runs every two weeks"},
                {"code": "monthly", "name": "Monthly", "description": "Runs every month"},
                {"code": "quarterly", "name": "Quarterly", "description": "Runs every quarter"},
                {"code": "yearly", "name": "Yearly", "description": "Runs every year"}
            ]
        },
        {
            "code": "DAY_OF_WEEK",
            "name": "Day of Week",
            "description": "Days of the week",
            "icon": "Calendar",
            "values": [
                {"code": "monday", "name": "Monday", "description": "Monday"},
                {"code": "tuesday", "name": "Tuesday", "description": "Tuesday"},
                {"code": "wednesday", "name": "Wednesday", "description": "Wednesday"},
                {"code": "thursday", "name": "Thursday", "description": "Thursday"},
                {"code": "friday", "name": "Friday", "description": "Friday"},
                {"code": "saturday", "name": "Saturday", "description": "Saturday"},
                {"code": "sunday", "name": "Sunday", "description": "Sunday"}
            ]
        },
        {
            "code": "SCHEDULE_STATUS",
            "name": "Schedule Status",
            "description": "Report schedule active status",
            "icon": "ToggleRight",
            "values": [
                {"code": "active", "name": "Active", "description": "Schedule is running"},
                {"code": "inactive", "name": "Inactive", "description": "Schedule is paused"}
            ]
        },
        {
            "code": "PAYROLL_STATUS",
            "name": "Payroll Status",
            "description": "Payroll record status",
            "icon": "Wallet",
            "values": [
                {"code": "paid", "name": "Paid", "description": "Payroll paid"},
                {"code": "pending", "name": "Pending", "description": "Payroll pending"},
                {"code": "processing", "name": "Processing", "description": "Payroll processing"},
                {"code": "draft", "name": "Draft", "description": "Payroll draft"}
            ]
        }
    ],
    "payroll": [
        {
            "code": "MONTH",
            "name": "Month",
            "description": "Months of the year",
            "icon": "Calendar",
            "values": [
                {"code": "january", "name": "January", "description": "January", "sort_order": 1},
                {"code": "february", "name": "February", "description": "February", "sort_order": 2},
                {"code": "march", "name": "March", "description": "March", "sort_order": 3},
                {"code": "april", "name": "April", "description": "April", "sort_order": 4},
                {"code": "may", "name": "May", "description": "May", "sort_order": 5},
                {"code": "june", "name": "June", "description": "June", "sort_order": 6},
                {"code": "july", "name": "July", "description": "July", "sort_order": 7},
                {"code": "august", "name": "August", "description": "August", "sort_order": 8},
                {"code": "september", "name": "September", "description": "September", "sort_order": 9},
                {"code": "october", "name": "October", "description": "October", "sort_order": 10},
                {"code": "november", "name": "November", "description": "November", "sort_order": 11},
                {"code": "december", "name": "December", "description": "December", "sort_order": 12}
            ]
        },
        {
            "code": "PAYROLL_PAYMENT_METHOD",
            "name": "Payment Method",
            "description": "Payment methods for payroll",
            "icon": "CreditCard",
            "values": [
                {"code": "bank_transfer", "name": "Bank Transfer", "description": "Direct bank transfer"},
                {"code": "check", "name": "Check", "description": "Check payment"},
                {"code": "cash", "name": "Cash", "description": "Cash payment"},
                {"code": "electronic", "name": "Electronic", "description": "Electronic payment"}
            ]
        },
        {
            "code": "ROUNDING_METHOD",
            "name": "Rounding Method",
            "description": "Payroll rounding methods",
            "icon": "Calculator",
            "values": [
                {"code": "nearest", "name": "Nearest", "description": "Round to nearest"},
                {"code": "floor", "name": "Floor", "description": "Round down"},
                {"code": "ceil", "name": "Ceiling", "description": "Round up"},
                {"code": "truncate", "name": "Truncate", "description": "Truncate decimals"}
            ]
        },
        {
            "code": "PAYROLL_PRO_RATA",
            "name": "Pro-ration Method",
            "description": "How payroll is pro-rated",
            "icon": "Percent",
            "values": [
                {"code": "paid_days", "name": "Paid Days", "description": "Pro-rate by paid days"},
                {"code": "calendar_days", "name": "Calendar Days", "description": "Pro-rate by calendar days"},
                {"code": "working_days", "name": "Working Days", "description": "Pro-rate by working days"}
            ]
        },
        {
            "code": "PAYROLL_COMPUTE_MODE",
            "name": "Compute Mode",
            "description": "Payroll computation modes",
            "icon": "Cpu",
            "values": [
                {"code": "auto", "name": "Automatic", "description": "Compute automatically"},
                {"code": "manual", "name": "Manual", "description": "Enter values manually"}
            ]
        },
        {
            "code": "PAYROLL_COMPONENT_TYPE",
            "name": "Component Type",
            "description": "Payroll component types",
            "icon": "List",
            "values": [
                {"code": "earning", "name": "Earning", "description": "Earning component"},
                {"code": "deduction", "name": "Deduction", "description": "Deduction component"},
                {"code": "employer_contribution", "name": "Employer Contribution", "description": "Employer contribution"}
            ]
        },
        {
            "code": "PAYROLL_CALCULATION_TYPE",
            "name": "Calculation Type",
            "description": "How payroll components are calculated",
            "icon": "FunctionSquare",
            "values": [
                {"code": "percentage", "name": "Percentage", "description": "Percentage of base"},
                {"code": "fixed", "name": "Fixed Amount", "description": "Fixed amount"},
                {"code": "formula", "name": "Formula", "description": "Formula based"}
            ]
        },
        {
            "code": "PAYROLL_COMPONENT_BASIS",
            "name": "Component Basis",
            "description": "Basis for component calculation",
            "icon": "Target",
            "values": [
                {"code": "basic", "name": "Basic Salary", "description": "Basic salary as base"},
                {"code": "gross", "name": "Gross Salary", "description": "Gross salary as base"},
                {"code": "net", "name": "Net Salary", "description": "Net salary as base"}
            ]
        },
        {
            "code": "TAX_REGIME_TYPE",
            "name": "Tax Regime Type",
            "description": "Tax regime types",
            "icon": "Landmark",
            "values": [
                {"code": "new", "name": "New Regime", "description": "New tax regime"},
                {"code": "old", "name": "Old Regime", "description": "Old tax regime"},
                {"code": "custom", "name": "Custom Regime", "description": "Custom tax regime"}
            ]
        }
    ],
    "performance": [
        {
            "code": "SALARY_RECOMMENDATION",
            "name": "Salary Recommendation",
            "description": "Salary recommendation options",
            "icon": "DollarSign",
            "values": [
                {"code": "increase", "name": "Increase", "description": "Salary increase"},
                {"code": "decrease", "name": "Decrease", "description": "Salary decrease"},
                {"code": "no_change", "name": "No Change", "description": "No salary change"},
                {"code": "bonus", "name": "Bonus", "description": "Bonus only"}
            ]
        },
        {
            "code": "PROMOTION_ELIGIBLE",
            "name": "Promotion Eligible",
            "description": "Promotion eligibility status",
            "icon": "TrendingUp",
            "values": [
                {"code": "yes", "name": "Yes", "description": "Eligible for promotion"},
                {"code": "no", "name": "No", "description": "Not eligible for promotion"},
                {"code": "pending", "name": "Pending", "description": "Pending review"}
            ]
        },
        {
            "code": "REVIEW_PERIOD",
            "name": "Review Period",
            "description": "Performance review period",
            "icon": "Calendar",
            "values": [
                {"code": "q1", "name": "Q1", "description": "First quarter"},
                {"code": "q2", "name": "Q2", "description": "Second quarter"},
                {"code": "q3", "name": "Q3", "description": "Third quarter"},
                {"code": "q4", "name": "Q4", "description": "Fourth quarter"},
                {"code": "h1", "name": "H1", "description": "First half"},
                {"code": "h2", "name": "H2", "description": "Second half"},
                {"code": "annual", "name": "Annual", "description": "Annual review"}
            ]
        },
        {
            "code": "REVIEW_CYCLE",
            "name": "Review Cycle",
            "description": "Performance review cycle",
            "icon": "RefreshCw",
            "values": [
                {"code": "monthly", "name": "Monthly", "description": "Monthly review cycle"},
                {"code": "quarterly", "name": "Quarterly", "description": "Quarterly review cycle"},
                {"code": "semi-annual", "name": "Semi-Annual", "description": "Semi-annual review cycle"},
                {"code": "annual", "name": "Annual", "description": "Annual review cycle"}
            ]
        },
        {
            "code": "PERFORMANCE_STATUS",
            "name": "Performance Status",
            "description": "Performance review/goal status",
            "icon": "BarChart3",
            "values": [
                {"code": "draft", "name": "Draft", "description": "In draft state"},
                {"code": "pending", "name": "Pending", "description": "Pending action"},
                {"code": "active", "name": "Active", "description": "Active"},
                {"code": "submitted", "name": "Submitted", "description": "Submitted for review"},
                {"code": "acknowledged", "name": "Acknowledged", "description": "Acknowledged"},
                {"code": "completed", "name": "Completed", "description": "Completed"}
            ]
        }
    ],
    "recruitment": [
        {
            "code": "JOB_STATUS",
            "name": "Job Status",
            "description": "Job opening status",
            "icon": "Briefcase",
            "values": [
                {"code": "open", "name": "Open", "description": "Open position"},
                {"code": "closed", "name": "Closed", "description": "Closed position"},
                {"code": "on_hold", "name": "On Hold", "description": "Position on hold"}
            ]
        },
        {
            "code": "RECRUITMENT_EMPLOYMENT_TYPE",
            "name": "Employment Type",
            "description": "Employment type for job positions",
            "icon": "Briefcase",
            "values": [
                {"code": "full_time", "name": "Full Time", "description": "Full time employment"},
                {"code": "part_time", "name": "Part Time", "description": "Part time employment"},
                {"code": "contract", "name": "Contract", "description": "Contract employment"},
                {"code": "intern", "name": "Intern", "description": "Internship"},
                {"code": "freelance", "name": "Freelance", "description": "Freelance position"}
            ]
        },
        {
            "code": "JOB_LOCATION",
            "name": "Job Location Type",
            "description": "Work location type for job positions",
            "icon": "MapPin",
            "values": [
                {"code": "onsite", "name": "Onsite", "description": "Work from office"},
                {"code": "remote", "name": "Remote", "description": "Work from anywhere"},
                {"code": "hybrid", "name": "Hybrid", "description": "Mix of office and remote"},
                {"code": "field", "name": "Field", "description": "Field / on-site client work"}
            ]
        },
        {
            "code": "APPLICATION_STATUS",
            "name": "Application Status",
            "description": "Job application status",
            "icon": "Users",
            "values": [
                {"code": "applied", "name": "Applied", "description": "Application submitted"},
                {"code": "invited", "name": "Invited", "description": "HR invited the candidate"},
                {"code": "shortlisted", "name": "Shortlisted", "description": "Selected for shortlist"},
                {"code": "not_arrived", "name": "Not Arrived", "description": "Candidate did not arrive for the interview"},
                {"code": "rejected", "name": "Rejected", "description": "Application rejected"}
            ]
        },
        {
            "code": "INTERVIEW_STATUS",
            "name": "Interview Status",
            "description": "Interview status",
            "icon": "Calendar",
            "values": [
                {"code": "scheduled", "name": "Scheduled", "description": "Interview scheduled"},
                {"code": "selected", "name": "Selected", "description": "Candidate selected after interview"},
                {"code": "completed", "name": "Completed", "description": "Interview completed"},
                {"code": "cancelled", "name": "Cancelled", "description": "Interview cancelled"},
                {"code": "rejected", "name": "Rejected", "description": "Candidate rejected after interview"},
                {"code": "rescheduled", "name": "Rescheduled", "description": "Interview rescheduled"},
                {"code": "no_show", "name": "Not Arrived", "description": "Candidate did not show up"},
                {"code": "in_progress", "name": "In Progress", "description": "Interview in progress"},
                {"code": "pending", "name": "Pending", "description": "Interview pending"}
            ]
        }
    ],
    "exit": [
        {
            "code": "EXIT_TYPE",
            "name": "Exit Type",
            "description": "Employee exit/termination types",
            "icon": "LogOut",
            "values": [
                {"code": "resigned", "name": "Resigned", "description": "Voluntary resignation"},
                {"code": "terminated", "name": "Terminated", "description": "Involuntary termination"},
                {"code": "retired", "name": "Retired", "description": "Retirement"},
                {"code": "absconded", "name": "Absconded", "description": "Absconded"}
            ]
        },
        {
            "code": "FNF_STATUS",
            "name": "Full & Final Status",
            "description": "Full and final settlement status",
            "icon": "CheckCircle",
            "values": [
                {"code": "pending", "name": "Pending", "description": "FnF pending"},
                {"code": "in_progress", "name": "In Progress", "description": "FnF in progress"},
                {"code": "completed", "name": "Completed", "description": "FnF completed"}
            ]
        },
        {
            "code": "NOTICE_PERIOD_SERVED",
            "name": "Notice Period Served",
            "description": "Whether notice period was served",
            "icon": "Clock",
            "values": [
                {"code": "yes", "name": "Yes", "description": "Notice period served"},
                {"code": "no", "name": "No", "description": "Notice period not served"},
                {"code": "partial", "name": "Partial", "description": "Notice period partially served"}
            ]
        }
    ],
    "asset": [
        {
            "code": "ASSET_TYPE",
            "name": "Asset Type",
            "description": "Types of company assets",
            "icon": "Package",
            "values": [
                {"code": "laptop", "name": "Laptop", "description": "Laptop computer"},
                {"code": "desktop", "name": "Desktop", "description": "Desktop computer"},
                {"code": "monitor", "name": "Monitor", "description": "Monitor display"},
                {"code": "mobile", "name": "Mobile", "description": "Mobile phone"},
                {"code": "tablet", "name": "Tablet", "description": "Tablet device"},
                {"code": "headphone", "name": "Headphone", "description": "Headset/headphone"},
                {"code": "printer", "name": "Printer", "description": "Printer device"},
                {"code": "other", "name": "Other", "description": "Other asset type"}
            ]
        },
        {
            "code": "ASSET_STATUS",
            "name": "Asset Status",
            "description": "Asset availability status",
            "icon": "CheckCircle",
            "values": [
                {"code": "available", "name": "Available", "description": "Asset available"},
                {"code": "assigned", "name": "Assigned", "description": "Asset assigned"},
                {"code": "maintenance", "name": "Maintenance", "description": "Under maintenance"}
            ]
        },
        {
            "code": "PRIORITY",
            "name": "Priority",
            "description": "Priority levels for tasks",
            "icon": "Flag",
            "values": [
                {"code": "low", "name": "Low", "description": "Low priority"},
                {"code": "medium", "name": "Medium", "description": "Medium priority"},
                {"code": "high", "name": "High", "description": "High priority"}
            ]
        }
    ]
}

# Categories that belong under their own module tab on the Master Data page,
# regardless of which block they are physically defined in.
CATEGORY_GROUP_OVERRIDES = {
    "PAYROLL_CYCLE": "payroll",
    "PAY_DAY": "payroll",
    "PAYROLL_STATUS": "payroll",
    "WORKING_DAYS_PER_WEEK": "payroll",
    "RATING_SCALE": "performance",
    "REVIEW_FREQUENCY": "performance",
    "REPORT_FREQUENCY": "reports",
    "SCHEDULE_STATUS": "reports",
    "ROSTER_ASSIGN_LEVEL": "attendance",
    "DAY_OF_WEEK": "attendance",
    "ROLES": "settings",
    "AUDIT_MODULE": "settings",
    "AUDIT_ACTION": "settings",
    "MODULES": "settings",
    "TRANSFER_TYPE": "employee",
    "ANOMALY_SEVERITY": "anomaly",
    "ANOMALY_TYPE": "anomaly",
    "ANOMALY_STATUS": "anomaly",
    "INTERVIEW_TYPE": "recruitment",
    "INTERVIEW_ROUND": "recruitment",
    "SKILL_PROFICIENCY": "employee",
}

# Frontend category codes that map to a canonical master-data category code.
LOOKUP_ALIASES = {
    "COMPANY_STATUS": "ORG_STATUS",
    "BRANCH_STATUS": "ORG_STATUS",
    "DEPARTMENT_STATUS": "ORG_STATUS",
    "DESIGNATION_STATUS": "ORG_STATUS",
    "EMPLOYEE_STATUS": "EMP_STATUS",
    "DEVICE_TYPE": "EMPLOYEE_DEVICE_TYPE",
    "IS_BILLABLE": "BILLABLE_TO_CLIENT",
    "EXPENSE_PAYMENT_METHOD": "PAYMENT_METHOD",
    "PAYROLL_MONTH": "MONTH",
    "SALARY_RECOMMENDATIONS": "SALARY_RECOMMENDATION",
    "DESIGNATION_GRADE": "GRADE",
    "PERFORMANCE_REVIEW_CYCLE": "REVIEW_CYCLE",
    "PERFORMANCE_REVIEW_PERIOD": "REVIEW_PERIOD",
    "ATTENDANCE_TYPE": "ATTENDANCE_STATUS",
}


def _resolve_lookup_category_code(category_code: str) -> str:
    norm = (category_code or "").strip().upper()
    return LOOKUP_ALIASES.get(norm, norm)


def _default_category_config(code: str) -> Optional[dict]:
    for categories in DEFAULT_MASTER_DATA.values():
        for cat in categories:
            if cat["code"] == code:
                return cat
    return None


def _defaults_lookup_response(category_code: str) -> dict:
    cfg = _default_category_config(category_code)
    if not cfg:
        return {"category": {"code": category_code, "name": category_code}, "values": []}
    return {
        "category": {"code": cfg["code"], "name": cfg["name"]},
        "values": [
            {
                "id": idx,
                "code": val["code"],
                "name": val["name"],
                "description": val.get("description"),
                "is_active": True,
            }
            for idx, val in enumerate(cfg.get("values", []), start=1)
        ],
    }


def _lookup_values_join():
    return and_(
        LookupCategory.id == LookupValue.category_id,
        LookupValue.is_deleted.is_(False),
    )


def ensure_default_master_data(db: Session) -> dict:
    """Ensure every default category/value exists. Never overwrites admin edits."""
    result = _run_master_data_seed(db)
    try:
        sync_leave_types_from_master_data(db)
    except Exception:
        pass
    return result

# Pydantic schemas
class LookupValueBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True
    is_default: Optional[bool] = False

class LookupValueCreate(LookupValueBase):
    created_by: Optional[str] = None
    created_by_email: Optional[str] = None

class LookupValueUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    updated_by: Optional[str] = None
    updated_by_email: Optional[str] = None

class LookupValueResponse(LookupValueBase):
    id: int
    category_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_by_email: Optional[str] = None
    updated_by: Optional[str] = None
    updated_by_email: Optional[str] = None
    
    class Config:
        from_attributes = True

class LookupCategoryBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool = True

class LookupCategoryCreate(LookupCategoryBase):
    pass

class LookupCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class LookupCategoryResponse(LookupCategoryBase):
    id: int
    is_system: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    values: List[LookupValueResponse] = []
    
    class Config:
        from_attributes = True

class LookupCategoryListResponse(LookupCategoryBase):
    id: int
    is_system: bool
    values_count: int
    page_group: str
    icon: Optional[str]
    
    class Config:
        from_attributes = True

# Category endpoints
@router.get("/categories", response_model=List[LookupCategoryListResponse])
def get_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all lookup categories with value counts (cached for 5 minutes)"""
    cache_key = make_key("master_data", "categories")
    
    # Try Redis cache first
    if redis_client:
        cached = redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    
    # Optimize with single query using join
    from sqlalchemy import func
    query = db.query(
        LookupCategory,
        func.count(LookupValue.id).label('values_count')
    ).outerjoin(
        LookupValue, _lookup_values_join()
    ).filter(
        LookupCategory.deleted_at.is_(None),
    ).group_by(LookupCategory.id).all()
    
    result = []
    for cat, values_count in query:
        cat_dict = {
            "id": cat.id,
            "code": cat.code,
            "name": cat.name,
            "description": cat.description,
            "page_group": cat.page_group or "general",
            "icon": cat.icon,
            "is_active": cat.is_active,
            "is_system": cat.is_system,
            "values_count": values_count
        }
        result.append(cat_dict)
    
    # Cache for 5 minutes
    if redis_client:
        redis_client.setex(cache_key, 300, json.dumps(result))
    
    return result

@router.get("/categories/grouped")
def get_categories_grouped(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all lookup categories grouped by page (employee, company, leave, etc.)"""
    cache_key = make_key("master_data", "categories", "grouped")
    
    # Try Redis cache first
    if redis_client:
        cached = redis_client.get(cache_key)
        if cached:
            return json.loads(cached)
    
    # Get all categories with counts
    from sqlalchemy import func
    query = db.query(
        LookupCategory,
        func.count(LookupValue.id).label('values_count')
    ).outerjoin(
        LookupValue, _lookup_values_join()
    ).filter(
        LookupCategory.deleted_at.is_(None),
    ).group_by(LookupCategory.id).all()
    
    # Group by page (order matters - this is the tab order, matching the sidebar)
    groups = {
        "company": {"name": "Company", "icon": "Building2", "categories": []},
        "employee": {"name": "Employees", "icon": "Users", "categories": []},
        "recruitment": {"name": "Recruitment", "icon": "Briefcase", "categories": []},
        "holiday": {"name": "Holidays", "icon": "CalendarDays", "categories": []},
        "attendance": {"name": "Attendance", "icon": "Clock", "categories": []},
        "leave": {"name": "Leaves", "icon": "Calendar", "categories": []},
        "payroll": {"name": "Payroll", "icon": "TrendingUp", "categories": []},
        "anomaly": {"name": "Anomalies", "icon": "AlertTriangle", "categories": []},
        "expense": {"name": "Expenses", "icon": "Receipt", "categories": []},
        "exit": {"name": "Exits", "icon": "LogOut", "categories": []},
        "asset": {"name": "Assets", "icon": "Laptop", "categories": []},
        "performance": {"name": "Performance", "icon": "TrendingUp", "categories": []},
        "reports": {"name": "Reports", "icon": "FileBarChart", "categories": []},
        "settings": {"name": "Settings", "icon": "Settings", "categories": []}
    }
    
    for cat, values_count in query:
        cat_dict = {
            "id": cat.id,
            "code": cat.code,
            "name": cat.name,
            "description": cat.description,
            "icon": cat.icon,
            "is_active": cat.is_active,
            "is_system": cat.is_system,
            "values_count": values_count
        }
        group_key = cat.page_group or "general"
        if group_key in groups:
            groups[group_key]["categories"].append(cat_dict)
    
    # Remove empty groups
    result = {k: v for k, v in groups.items() if v["categories"]}
    
    # Cache for 5 minutes
    if redis_client:
        redis_client.setex(cache_key, 300, json.dumps(result))
    
    return result

@router.get("/categories/{category_id}", response_model=LookupCategoryResponse)
def get_category(category_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get a single category with all its values (ordered by sort_order)"""
    category = db.query(LookupCategory).options(
        joinedload(LookupCategory.values)
    ).filter(LookupCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    # joinedload does not guarantee collection order — sort explicitly.
    if category.values:
        category.values = sorted(
            [v for v in category.values if not getattr(v, "is_deleted", False)],
            key=lambda v: (0 if v.is_active else 1, v.sort_order or 0, (v.name or "")),
        )
    return category

def clear_category_cache(category_code: str = None):
    """Clear relevant caches"""
    invalidate_master_data_caches(category_code)


def sync_leave_types_from_master_data(db: Session, deleted_ids: Optional[List[int]] = None):
    """Keep the `leave_types` table in sync with the LEAVE_TYPE master data.

    Leave types are edited on the Master Data page (LEAVE_TYPE lookup), but leave
    records reference `LeaveApplication.leave_type_id` -> `leave_types.id`. This
    reconciles the two so that any leave type added or updated in Master Data:
      * resolves its name on leave records / lists,
      * links correctly when syncing attendance to leaves.
    Mirrored rows reuse the master-data value id so foreign keys align.
    """
    from models import LeaveType as LeaveTypeModel
    try:
        category = db.query(LookupCategory).filter(LookupCategory.code == "LEAVE_TYPE").first()
        if not category:
            return
        values = db.query(LookupValue).filter(
            LookupValue.category_id == category.id,
            LookupValue.is_deleted == False,
        ).all()
        active_ids = set()
        # Paid/unpaid convention derived from the leave type code: LOP/unpaid
        # leave types reduce paid days; everything else is paid.
        UNPAID_CODES = {"lop", "loss_of_pay", "unpaid", "unpaid_leave", "leave_without_pay"}
        for v in values:
            code = (v.code or "").lower()
            name = v.name or ""
            if not code and not name:
                continue
            lt = db.query(LeaveTypeModel).filter(
                or_(LeaveTypeModel.id == v.id, func.lower(LeaveTypeModel.code) == code)
            ).first()
            is_paid = code not in UNPAID_CODES
            if lt:
                lt.name = name
                lt.code = code or lt.code
                lt.status = "active" if v.is_active else "inactive"
                if getattr(lt, "is_paid", None) is None:
                    lt.is_paid = is_paid
            else:
                db.add(LeaveTypeModel(
                    id=v.id,
                    code=code,
                    name=name,
                    days_allowed=0,
                    carry_forward=False,
                    status="active" if v.is_active else "inactive",
                    is_paid=is_paid,
                ))
            if v.is_active:
                active_ids.add(v.id)
        # Deactivate mirrored rows whose master value was hard-deleted
        if deleted_ids:
            for lid in deleted_ids:
                lt = db.query(LeaveTypeModel).filter(LeaveTypeModel.id == lid).first()
                if lt:
                    lt.status = "inactive"
        db.commit()
    except Exception:
        db.rollback()

@router.post("/categories", response_model=LookupCategoryResponse)
def create_category(category: LookupCategoryCreate, db: Session = Depends(get_db), current_user = Depends(require_superadmin)):
    """Create a new lookup category (superadmin only)"""
    existing = db.query(LookupCategory).filter(LookupCategory.code == category.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category code already exists")
    
    db_category = LookupCategory(**category.dict())
    db.add(db_category)
    db.commit()
    db.refresh(db_category)
    
    # Clear cache
    clear_category_cache()
    
    return db_category

@router.put("/categories/{category_id}", response_model=LookupCategoryResponse)
def update_category(category_id: int, category: LookupCategoryUpdate, db: Session = Depends(get_db), current_user = Depends(require_superadmin)):
    """Update a lookup category (superadmin only)"""
    db_category = db.query(LookupCategory).filter(LookupCategory.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    if db_category.is_system:
        raise HTTPException(status_code=403, detail="Cannot modify system categories")
    
    old_code = db_category.code
    
    for key, value in category.dict(exclude_unset=True).items():
        setattr(db_category, key, value)
    
    db.commit()
    db.refresh(db_category)
    
    # Clear cache
    clear_category_cache(old_code)
    if old_code != db_category.code:
        clear_category_cache(db_category.code)
    
    return db_category

@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db), current_user = Depends(require_superadmin)):
    """Delete a lookup category (superadmin only)"""
    db_category = db.query(LookupCategory).filter(LookupCategory.id == category_id).first()
    if not db_category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    if db_category.is_system:
        raise HTTPException(status_code=403, detail="Cannot delete system categories")
    
    old_code = db_category.code
    db.delete(db_category)
    db.commit()
    
    # Clear cache
    clear_category_cache(old_code)
    
    return {"message": "Category deleted successfully"}

# Value endpoints
@router.get("/categories/{category_id}/values", response_model=List[LookupValueResponse])
def get_values_by_category(category_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all lookup values for a category (excluding soft-deleted)"""
    values = db.query(LookupValue).filter(
        LookupValue.category_id == category_id,
        LookupValue.is_deleted == False
    ).order_by(LookupValue.sort_order, LookupValue.name).all()
    return values

@router.get("/values/{value_id}", response_model=LookupValueResponse)
def get_value(value_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get a single lookup value"""
    value = db.query(LookupValue).filter(LookupValue.id == value_id).first()
    if not value:
        raise HTTPException(status_code=404, detail="Value not found")
    return value

@router.post("/categories/{category_id}/values", response_model=LookupValueResponse)
def create_value(category_id: int, value: LookupValueCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Create a new lookup value in a category with audit"""
    if current_user.role not in ("superadmin", "admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Only admins can modify master data")
    category = db.query(LookupCategory).filter(LookupCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.is_system:
        raise HTTPException(status_code=403, detail="System lookup values cannot be added. You may rename existing labels only.")
    
    existing = db.query(LookupValue).filter(
        LookupValue.category_id == category_id,
        LookupValue.code == value.code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Value code already exists in this category")
    
    # Build value data with audit fields
    value_data = value.dict(exclude={'created_by', 'created_by_email'})
    db_value = LookupValue(
        **value_data,
        category_id=category_id,
        created_by=value.created_by or (current_user.full_name if hasattr(current_user, 'full_name') else None),
        created_by_email=value.created_by_email or (current_user.email if hasattr(current_user, 'email') else None)
    )
    db.add(db_value)
    db.commit()
    db.refresh(db_value)
    
    # Keep leave_types in sync with LEAVE_TYPE master data
    if category.code == "LEAVE_TYPE":
        sync_leave_types_from_master_data(db)

    # Clear cache
    clear_category_cache(category.code)
    
    return db_value

@router.patch("/values/{value_id}", response_model=LookupValueResponse)
def update_value(value_id: int, value: LookupValueUpdate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Update a lookup value with audit"""
    if current_user.role not in ("superadmin", "admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Only admins can modify master data")
    db_value = db.query(LookupValue).filter(LookupValue.id == value_id).first()
    if not db_value:
        raise HTTPException(status_code=404, detail="Value not found")
    
    # Get category code before update
    category = db.query(LookupCategory).filter(LookupCategory.id == db_value.category_id).first()
    category_code = category.code if category else None
    is_system = bool(category and category.is_system)

    if is_system:
        if value.code is not None and value.code != db_value.code:
            raise HTTPException(status_code=403, detail="System lookup codes cannot be changed")
        if value.is_active is not None and value.is_active != db_value.is_active:
            raise HTTPException(status_code=403, detail="System lookup status cannot be changed")
        if value.description is not None and value.description != db_value.description:
            raise HTTPException(status_code=403, detail="System lookup descriptions cannot be changed")
        if value.is_default is not None and value.is_default != db_value.is_default:
            raise HTTPException(status_code=403, detail="System lookup defaults cannot be changed")
        # sort_order is updated via the reorder endpoint only
        if value.sort_order is not None and value.sort_order != db_value.sort_order:
            raise HTTPException(status_code=403, detail="Use reorder to change system lookup order")
    elif value.code is not None and value.code != db_value.code:
        existing = db.query(LookupValue).filter(
            LookupValue.category_id == db_value.category_id,
            LookupValue.code == value.code,
            LookupValue.id != value_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Code '{value.code}' already exists in this category")
    
    # Update fields - system rows: rename display label only (order via /values/reorder)
    if not is_system and value.code is not None:
        db_value.code = value.code
    if value.name is not None:
        db_value.name = value.name
    if not is_system and value.description is not None:
        db_value.description = value.description
    if not is_system and value.sort_order is not None:
        db_value.sort_order = value.sort_order
    if not is_system and value.is_active is not None:
        db_value.is_active = value.is_active
    if not is_system and value.is_default is not None:
        db_value.is_default = value.is_default
    
    # Set audit fields
    db_value.updated_by = value.updated_by or (current_user.full_name if hasattr(current_user, 'full_name') else None)
    db_value.updated_by_email = value.updated_by_email or (current_user.email if hasattr(current_user, 'email') else None)
    db_value.updated_at = ist_now_naive()
    
    db.commit()
    db.refresh(db_value)
    
    # Keep leave_types in sync with LEAVE_TYPE master data
    if category_code == "LEAVE_TYPE":
        sync_leave_types_from_master_data(db)

    # Clear cache
    if category_code:
        clear_category_cache(category_code)
    
    return db_value

class DeleteValueRequest(BaseModel):
    deleted_by: Optional[str] = None
    deleted_by_email: Optional[str] = None

@router.delete("/values/{value_id}")
def delete_value(value_id: int, request: DeleteValueRequest = None, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Hard delete a lookup value"""
    if current_user.role not in ("superadmin", "admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Only admins can modify master data")
    db_value = db.query(LookupValue).filter(LookupValue.id == value_id).first()
    if not db_value:
        raise HTTPException(status_code=404, detail="Value not found")
    
    # Get category code before delete
    category = db.query(LookupCategory).filter(LookupCategory.id == db_value.category_id).first()
    category_code = category.code if category else None
    if category and category.is_system:
        raise HTTPException(status_code=403, detail="System lookup values cannot be deleted. You may rename labels only.")
    db.delete(db_value)
    db.commit()
    
    # Keep leave_types in sync with LEAVE_TYPE master data
    if category_code == "LEAVE_TYPE":
        sync_leave_types_from_master_data(db, deleted_ids=[value_id])

    # Clear cache
    if category_code:
        clear_category_cache(category_code)
    
    return {"message": "Value deleted successfully"}

# Reorder values endpoint
class ReorderValuesRequest(BaseModel):
    category_id: int
    ordered_ids: List[int]
    updated_by: Optional[str] = None

@router.post("/values/reorder")
def reorder_values(request: ReorderValuesRequest, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Reorder lookup values by updating their sort_order"""
    from datetime import datetime
    
    if current_user.role not in ("superadmin", "admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Only admins can modify master data")
    
    # Verify all values belong to the same category
    values = db.query(LookupValue).filter(
        LookupValue.category_id == request.category_id,
        LookupValue.id.in_(request.ordered_ids)
    ).all()
    
    if len(values) != len(request.ordered_ids):
        raise HTTPException(status_code=400, detail="Some values not found or do not belong to this category")
    
    # Update sort_order for each value
    for index, value_id in enumerate(request.ordered_ids):
        value = next((v for v in values if v.id == value_id), None)
        if value:
            value.sort_order = index
            value.updated_by = request.updated_by or (current_user.full_name if hasattr(current_user, 'full_name') else None)
            value.updated_by_email = current_user.email if hasattr(current_user, 'email') else None
            value.updated_at = ist_now_naive()
    
    db.commit()
    
    # Clear cache
    category = db.query(LookupCategory).filter(LookupCategory.id == request.category_id).first()
    if category:
        clear_category_cache(category.code)
    
    return {"message": "Values reordered successfully"}

# Lookup endpoint for frontend dropdowns — defined once (see get_lookup_by_code below).
# Seed default master data
def _run_master_data_seed(db: Session) -> dict:
    """Create any missing default categories and values.

    NEVER overwrites existing data — the Master Data page is the source of
    truth after first boot, so the user's edits (names, is_active, grouping)
    are always preserved.
    """
    created_categories = 0
    created_values = 0

    for page_group, categories in DEFAULT_MASTER_DATA.items():
        for cat_data in categories:
            effective_group = CATEGORY_GROUP_OVERRIDES.get(cat_data["code"], page_group)
            existing_cat = db.query(LookupCategory).filter(LookupCategory.code == cat_data["code"]).first()

            if not existing_cat:
                category = LookupCategory(
                    code=cat_data["code"],
                    name=cat_data["name"],
                    description=cat_data.get("description"),
                    page_group=effective_group,
                    icon=cat_data.get("icon"),
                    is_active=True,
                    is_system=True,
                )
                db.add(category)
                db.flush()
                created_categories += 1
                for val_data in cat_data.get("values", []):
                    db.add(LookupValue(
                        category_id=category.id,
                        code=val_data["code"],
                        name=val_data["name"],
                        description=val_data.get("description"),
                        is_active=True,
                        sort_order=0,
                    ))
                    created_values += 1
            else:
                # Category exists — never touch its page_group or existing
                # values. Only add genuinely missing default values.
                for val_data in cat_data.get("values", []):
                    exists = db.query(LookupValue).filter(
                        LookupValue.category_id == existing_cat.id,
                        LookupValue.code == val_data["code"],
                    ).first()
                    if not exists:
                        db.add(LookupValue(
                            category_id=existing_cat.id,
                            code=val_data["code"],
                            name=val_data["name"],
                            description=val_data.get("description"),
                            is_active=True,
                            sort_order=0,
                        ))
                        created_values += 1

    db.commit()
    invalidate_master_data_caches()
    return {"message": "Default master data seeded successfully", "created_categories": created_categories, "created_values": created_values}


def seed_default_master_data_if_needed(db: Session) -> bool:
    """Deprecated: master data is DB-managed only. Kept for backwards-compatible imports."""
    return False


@router.post("/seed-defaults")
def seed_default_master_data(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Disabled — lookup values must exist in the database; use Master Data to rename labels."""
    raise HTTPException(
        status_code=410,
        detail="Automatic seeding is disabled. Master data is managed in the database; rename values from the Master Data page.",
    )

@router.get("/export")
def export_master_data(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Export all master data as JSON"""
    categories = db.query(LookupCategory).all()
    export_data = []
    
    for category in categories:
        values = db.query(LookupValue).filter(LookupValue.category_id == category.id).all()
        export_data.append({
            "code": category.code,
            "name": category.name,
            "description": category.description,
            "page_group": category.page_group,
            "icon": category.icon,
            "is_system": category.is_system,
            "values": [
                {
                    "code": v.code,
                    "name": v.name,
                    "description": v.description,
                    "is_active": v.is_active,
                    "sort_order": v.sort_order
                }
                for v in values
            ]
        })
    
    return export_data

@router.post("/import")
def import_master_data(data: list, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    """Import master data from JSON"""
    if current_user.role not in ("superadmin", "admin", "hr_manager"):
        raise HTTPException(status_code=403, detail="Only admins can modify master data")
    imported_categories = 0
    imported_values = 0
    
    for cat_data in data:
        # Check if category exists
        existing_cat = db.query(LookupCategory).filter(LookupCategory.code == cat_data["code"]).first()
        
        if existing_cat:
            category = existing_cat
        else:
            category = LookupCategory(
                code=cat_data["code"],
                name=cat_data["name"],
                description=cat_data.get("description"),
                page_group=cat_data.get("page_group"),
                icon=cat_data.get("icon"),
                is_system=cat_data.get("is_system", False)
            )
            db.add(category)
            db.flush()
            imported_categories += 1
        
        # Import values
        for val_data in cat_data.get("values", []):
            existing_val = db.query(LookupValue).filter(
                LookupValue.category_id == category.id,
                LookupValue.code == val_data["code"]
            ).first()
            
            if not existing_val:
                value = LookupValue(
                    category_id=category.id,
                    code=val_data["code"],
                    name=val_data["name"],
                    description=val_data.get("description"),
                    is_active=val_data.get("is_active", True),
                    sort_order=val_data.get("sort_order", 0)
                )
                db.add(value)
                imported_values += 1
    
    db.commit()
    invalidate_master_data_caches()
    
    return {
        "message": "Master data imported successfully",
        "imported_categories": imported_categories,
        "imported_values": imported_values
    }

# Public lookup endpoint (for dropdowns)
def _system_lookup_values(category_code: str) -> dict:
    """Built-in system values (gender, blood group, ...).

    System values always come from the application itself — users never
    manage them — so lookups work on a clean database with zero setup.
    """
    for group in DEFAULT_MASTER_DATA.values():
        for cat in group:
            if str(cat.get("code", "")).upper() == category_code.upper():
                return {
                    "category": {"code": cat["code"], "name": cat.get("name", cat["code"])},
                    "values": [
                        {
                            "id": None,
                            "code": v.get("code"),
                            "name": v.get("name"),
                            "description": v.get("description"),
                            "is_active": True,
                        }
                        for v in cat.get("values", [])
                    ],
                    "source": "system",
                }
    return {"category": {"code": category_code, "name": category_code}, "values": [], "source": "system"}


@router.get("/lookup/{category_code}")
def get_lookup_by_code(category_code: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return lookup values: database rows when present, else built-in system values."""
    category_code = _resolve_lookup_category_code(category_code)
    cache_key = make_key("master_data", "lookup", category_code)

    if redis_client:
        cached = redis_client.get(cache_key)
        if cached:
            return json.loads(cached)

    result = db.query(LookupCategory, LookupValue).join(
        LookupValue, _lookup_values_join()
    ).filter(
        LookupCategory.code == category_code,
        LookupCategory.is_active.is_(True),
        LookupCategory.deleted_at.is_(None),
    ).order_by(LookupValue.is_active.desc(), LookupValue.sort_order, LookupValue.name).all()

    if not result:
        response = _system_lookup_values(category_code)
    else:
        category = result[0][0]
        values = [
            {
                "id": v.id,
                "code": v.code,
                "name": v.name,
                "description": v.description,
                "is_active": v.is_active,
            }
            for _, v in result
        ]
        response = {
            "category": {
                "id": category.id,
                "code": category.code,
                "name": category.name,
            },
            "values": values,
        }

    if redis_client:
        redis_client.setex(cache_key, 600, json.dumps(response))

    return response


# ==================== TERMINATION TYPES ====================

class TerminationTypeBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    requires_notice_period: bool = True

class TerminationTypeCreate(TerminationTypeBase):
    pass

class TerminationTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    requires_notice_period: Optional[bool] = None
    status: Optional[str] = None

class TerminationTypeResponse(TerminationTypeBase):
    id: int
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

@router.get("/termination-types", response_model=List[TerminationTypeResponse])
def get_termination_types(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all active termination types"""
    q = db.query(TerminationType).filter(TerminationType.status == 'active')
    if current_user.role != "superadmin" and current_user.organization_id:
        q = q.filter(TerminationType.organization_id == current_user.organization_id)
    return q.all()

@router.post("/termination-types", response_model=TerminationTypeResponse)
def create_termination_type(
    data: TerminationTypeCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_superadmin)
):
    """Create a new termination type (SuperAdmin only)"""
    existing = db.query(TerminationType).filter(TerminationType.code == data.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Termination type with this code already exists")
    
    db_type = TerminationType(**data.model_dump())
    db.add(db_type)
    db.commit()
    db.refresh(db_type)
    return db_type

@router.put("/termination-types/{type_id}", response_model=TerminationTypeResponse)
def update_termination_type(
    type_id: int,
    data: TerminationTypeUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_superadmin)
):
    """Update a termination type (SuperAdmin only)"""
    db_type = db.query(TerminationType).filter(TerminationType.id == type_id).first()
    if not db_type:
        raise HTTPException(status_code=404, detail="Termination type not found")
    
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(db_type, key, value)
    
    db.commit()
    db.refresh(db_type)
    return db_type

@router.delete("/termination-types/{type_id}")
def delete_termination_type(
    type_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_superadmin)
):
    """Delete a termination type (SuperAdmin only)"""
    db_type = db.query(TerminationType).filter(TerminationType.id == type_id).first()
    if not db_type:
        raise HTTPException(status_code=404, detail="Termination type not found")
    
    db.delete(db_type)
    db.commit()
    return {"message": "Termination type deleted successfully"}

