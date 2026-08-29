"""
AI Engine for HRMS - Automation, Insights & Intelligence
- Report Generation
- Predictive Analytics
- Natural Language Processing
- Anomaly Detection
"""
import os
import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

# OpenAI Integration (replace with your API key)
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')

class AIReportGenerator:
    """AI-powered report generation and insights"""
    
    def __init__(self):
        self.cache = {}
        
    def generate_employee_summary(self, employee_data: Dict) -> str:
        """Generate natural language summary of employee"""
        summary = f"""
        Employee: {employee_data.get('firstName')} {employee_data.get('lastName')}
        Role: {employee_data.get('designation')} in {employee_data.get('department')}
        Status: {employee_data.get('status')}
        Joined: {employee_data.get('joinDate')}
        
        Key Details:
        - Blood Group: {employee_data.get('bloodGroup', 'N/A')}
        - Emergency Contact: {employee_data.get('emergencyContact', 'N/A')}
        - Qualifications: {len(employee_data.get('educationDetails', []))} degrees
        - Family: {len(employee_data.get('familyInfo', []))} members registered
        """
        return summary
    
    def predict_attrition_risk(self, employee_metrics: Dict) -> Dict[str, Any]:
        """Predict attrition risk based on metrics"""
        risk_score = 0
        factors = []
        
        # Simple rule-based (replace with ML model)
        if employee_metrics.get('leaves_taken', 0) > 20:
            risk_score += 30
            factors.append("High leave usage")
        
        if employee_metrics.get('performance_score', 100) < 60:
            risk_score += 40
            factors.append("Low performance score")
        
        if employee_metrics.get('years_in_role', 0) > 3:
            risk_score += 20
            factors.append("No promotion in 3+ years")
        
        risk_level = "LOW" if risk_score < 30 else "MEDIUM" if risk_score < 60 else "HIGH"
        
        return {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "factors": factors,
            "recommendations": self._get_retention_recommendations(risk_level)
        }
    
    def _get_retention_recommendations(self, risk_level: str) -> List[str]:
        """Get retention strategies based on risk level"""
        recommendations = {
            "LOW": ["Continue regular check-ins", "Maintain current benefits"],
            "MEDIUM": ["Schedule career discussion", "Consider training opportunities"],
            "HIGH": ["Immediate manager meeting", "Review compensation", "Consider role change"]
        }
        return recommendations.get(risk_level, [])
    
    def generate_payroll_insights(self, payroll_data: List[Dict]) -> Dict:
        """Generate insights from payroll data"""
        df = pd.DataFrame(payroll_data)
        
        insights = {
            "total_payroll": df['amount'].sum() if 'amount' in df.columns else 0,
            "average_salary": df['amount'].mean() if 'amount' in df.columns else 0,
            "department_breakdown": df.groupby('department')['amount'].sum().to_dict() if 'department' in df.columns else {},
            "anomalies": self._detect_anomalies(df)
        }
        
        return insights
    
    def _detect_anomalies(self, df: pd.DataFrame) -> List[Dict]:
        """Detect payroll anomalies using statistical methods"""
        anomalies = []
        
        if 'amount' in df.columns and len(df) > 0:
            mean = df['amount'].mean()
            std = df['amount'].std()
            threshold = 3 * std
            
            outliers = df[abs(df['amount'] - mean) > threshold]
            for _, row in outliers.iterrows():
                anomalies.append({
                    "employee_id": row.get('employee_id'),
                    "amount": row.get('amount'),
                    "reason": "Statistical outlier"
                })
        
        return anomalies
    
    def natural_language_query(self, query: str, context: Dict) -> str:
        """Process natural language HR queries"""
        query_lower = query.lower()
        
        # Simple intent matching (replace with NLP model)
        if "leave balance" in query_lower:
            emp_id = context.get('employee_id')
            return f"Employee {emp_id} has 15 days annual leave remaining."
        
        if "salary" in query_lower or "payroll" in query_lower:
            return "Last month's payroll was processed on 5th. Average salary is ₹45,000."
        
        if "attendance" in query_lower:
            return "Current month attendance rate is 94.5%. 12 employees have <90% attendance."
        
        return "I can help with leave, salary, attendance queries. Please specify your question."


class ChatbotEngine:
    """HR Chatbot for user assistance"""
    
    def __init__(self):
        self.ai = AIReportGenerator()
        self.conversation_history = {}
        
    def process_message(self, user_id: str, message: str, context: Dict = None) -> Dict:
        """Process chat message and return response"""
        context = context or {}
        
        # Intent classification
        intent = self._classify_intent(message)
        
        # Generate response
        if intent == "greeting":
            response = "Hello! I'm your HR assistant. I can help with:\n• Employee search\n• Leave balance\n• Payroll info\n• Attendance\n• Policy questions"
        
        elif intent == "employee_search":
            response = self._handle_employee_search(message, context)
        
        elif intent == "leave_query":
            response = self._handle_leave_query(message, context)
        
        elif intent == "payroll_query":
            response = self._handle_payroll_query(message, context)
        
        elif intent == "attendance_query":
            response = self._handle_attendance_query(message, context)
        
        elif intent == "help":
            response = "Available commands:\n• 'Find employee [name]'\n• 'My leave balance'\n• 'Show payroll'\n• 'Attendance summary'\n• 'Department report'"
        
        else:
            # Use AI for unknown queries
            response = self.ai.natural_language_query(message, context)
        
        # Store history
        if user_id not in self.conversation_history:
            self.conversation_history[user_id] = []
        self.conversation_history[user_id].append({
            "timestamp": datetime.now().isoformat(),
            "user": message,
            "bot": response
        })
        
        return {
            "response": response,
            "intent": intent,
            "suggestions": self._get_suggestions(intent)
        }
    
    def _classify_intent(self, message: str) -> str:
        """Classify user intent"""
        msg_lower = message.lower()
        
        greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon']
        if any(g in msg_lower for g in greetings):
            return "greeting"
        
        if any(k in msg_lower for k in ['find', 'search', 'lookup', 'employee']):
            return "employee_search"
        
        if any(k in msg_lower for k in ['leave', 'vacation', 'holiday', 'time off']):
            return "leave_query"
        
        if any(k in msg_lower for k in ['salary', 'payroll', 'pay', 'wage', 'compensation']):
            return "payroll_query"
        
        if any(k in msg_lower for k in ['attendance', 'present', 'absent', 'working days']):
            return "attendance_query"
        
        if any(k in msg_lower for k in ['help', 'support', 'assist']):
            return "help"
        
        return "general"
    
    def _handle_employee_search(self, message: str, context: Dict) -> str:
        """Handle employee search queries"""
        # Extract name from query
        words = message.split()
        if len(words) > 2:
            name = ' '.join(words[2:])
            return f"Searching for employees matching '{name}'...\nFound 3 results:\n1. John Doe (Engineering)\n2. Jane Doe (HR)\n3. Johnny Smith (Sales)"
        return "Please specify employee name: 'Find employee [name]'"
    
    def _handle_leave_query(self, message: str, context: Dict) -> str:
        """Handle leave-related queries"""
        emp_id = context.get('employee_id', 'Current User')
        return f"Leave Summary for {emp_id}:\n• Annual: 15 days remaining\n• Sick: 5 days remaining\n• Casual: 3 days remaining\n\nPending approvals: 2 requests"
    
    def _handle_payroll_query(self, message: str, context: Dict) -> str:
        """Handle payroll queries"""
        return """Payroll Summary (Last Month):
• Total Processed: ₹2.4 Crore
• Employees: 523
• Average Salary: ₹45,900
• Deductions: ₹32 Lakh

Next payroll date: 5th of next month"""
    
    def _handle_attendance_query(self, message: str, context: Dict) -> str:
        """Handle attendance queries"""
        return """Attendance Summary (Current Month):
• Overall: 94.5%
• On-time: 89%
• Late arrivals: 5.5%
• Absent: 5.5%

Top performers: 12 employees with 100% attendance"""
    
    def _get_suggestions(self, intent: str) -> List[str]:
        """Get contextual suggestions"""
        suggestions = {
            "greeting": ["Find employee", "My leave balance", "Payroll info"],
            "employee_search": ["View details", "Edit employee", "Department report"],
            "leave_query": ["Apply leave", "Leave policy", "Holiday list"],
            "payroll_query": ["Download payslip", "Tax statement", "Reimbursements"],
            "attendance_query": ["Mark attendance", "Regularize", "Work from home"],
        }
        return suggestions.get(intent, ["Help", "Contact HR"])


class AutomationEngine:
    """Automated HR workflows and tasks"""
    
    def __init__(self):
        self.rules = []
        
    def setup_default_automations(self):
        """Setup default automation rules"""
        self.rules = [
            {
                "name": "Birthday Wishes",
                "trigger": "daily_at_9am",
                "condition": "employee_birthday_today",
                "action": "send_birthday_email"
            },
            {
                "name": "Probation Reminder",
                "trigger": "weekly",
                "condition": "probation_ending_in_7_days",
                "action": "notify_manager"
            },
            {
                "name": "Leave Balance Alert",
                "trigger": "monthly",
                "condition": "leave_balance_exceeds_30_days",
                "action": "notify_employee"
            },
            {
                "name": "Anniversary Recognition",
                "trigger": "daily_at_9am",
                "condition": "work_anniversary_today",
                "action": "send_anniversary_email"
            }
        ]
    
    def generate_monthly_reports(self) -> List[Dict]:
        """Auto-generate monthly HR reports"""
        return [
            {
                "name": "Headcount Report",
                "type": "headcount",
                "schedule": "1st of month",
                "recipients": ["hr@company.com", "ceo@company.com"]
            },
            {
                "name": "Attrition Analysis",
                "type": "attrition",
                "schedule": "1st of month",
                "recipients": ["hr@company.com"]
            },
            {
                "name": "Performance Summary",
                "type": "performance",
                "schedule": "Quarterly",
                "recipients": ["managers@company.com"]
            }
        ]


# Global instances
ai_engine = AIReportGenerator()
chatbot = ChatbotEngine()
automation = AutomationEngine()

if __name__ == "__main__":
    # Test chatbot
    response = chatbot.process_message("user_123", "What's my leave balance?")
    print("Chatbot Response:", json.dumps(response, indent=2))
