"""
Local NLP Engine for HRMS AI
Fully local intent classification, entity extraction, and response generation
No external API dependencies
"""
import re
import json
import math
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta
from collections import Counter

from hrms_ai.exceptions import AIContextError
from hrms_ai.schemas import AIContext
from hrms_ai.prompts import build_system_prompt, get_industry_prompt, get_role_prompt, get_country_prompt


class LocalNLPEngine:
    """Local NLP engine for HRMS AI"""
    
    def __init__(self):
        self.stop_words = self._load_stop_words()
        self.intent_patterns = self._load_intent_patterns()
        self.entity_patterns = self._load_entity_patterns()
        self.response_templates = self._load_response_templates()
    
    def _load_stop_words(self) -> set:
        return {
            'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it',
            'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were', 'will', 'with', 'the', 'this', 'but',
            'they', 'their', 'her', 'she', 'him', 'his', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
            'do', 'does', 'did', 'doing', 'can', 'could', 'should', 'would', 'may', 'might', 'must',
            'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
            'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
            'too', 'very', 'just', 'because', 'but', 'or', 'if', 'while', 'about', 'above', 'after',
            'again', 'further', 'then', 'once', 'up', 'down', 'out', 'off', 'over', 'under', 'what',
            'which', 'who', 'whom', 'tell', 'give', 'show', 'please', 'want', 'need', 'know', 'look',
            'see', 'help', 'assist', 'support', 'thanks', 'thank', 'ok', 'okay', 'yes', 'no',
        }
    
    def _load_intent_patterns(self) -> Dict[str, List[Tuple[List[str], float]]]:
        return {
            'greeting': [
                (['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'howdy'], 0.95),
                (['namaste', 'good day'], 0.9),
            ],
            'leave_balance_query': [
                (['leave balance', 'remaining leave', 'how many leaves', 'leave available', 'leave left'], 0.95),
                (['my leave', 'check leave', 'view leave balance', 'leaves remaining'], 0.9),
            ],
            'leave_application': [
                (['apply leave', 'request leave', 'take leave', 'need leave', 'apply for leave', 'leave request'], 0.9),
                (['book leave', 'submit leave', 'new leave', 'start leave'], 0.85),
            ],
            'leave_history_query': [
                (['leave history', 'past leave', 'previous leave', 'leave status', 'my leaves', 'leave record'], 0.9),
                (['leave applications', 'leave taken', 'leave details'], 0.85),
            ],
            'attendance_query': [
                (['attendance', 'present days', 'absent days', 'check in', 'check out', 'working days'], 0.9),
                (['my attendance', 'attendance summary', 'attendance record', 'mark attendance'], 0.85),
            ],
            'payroll_query': [
                (['payslip', 'salary', 'payroll', 'payment', 'income', 'take home', 'net pay'], 0.9),
                (['my salary', 'salary slip', 'payslip download', 'tax form', 'income details'], 0.85),
            ],
            'employee_search': [
                (['find employee', 'search employee', 'lookup employee', 'who is', 'employee details', 'employee info'], 0.9),
                (['locate employee', 'get employee', 'employee profile'], 0.85),
                (['find', 'search', 'lookup', 'locate', 'show me', 'tell me about', 'details of', 'who works', 'where is'], 0.7),
            ],
            'department_roster': [
                (['department', 'who is in', 'team in', 'members of', 'people in', 'staff in', 'employees in'], 0.85),
                (['list department', 'show department', 'department members', 'department team', 'department staff'], 0.8),
            ],
            'team_view': [
                (['my team', 'team members', 'reportees', 'direct reports', 'team overview'], 0.9),
                (['team list', 'team details', 'show team'], 0.85),
            ],
            'resignation': [
                (['resign', 'resignation', 'quit', 'leaving company', 'last working day', 'notice period'], 0.95),
                (['i want to resign', 'submit resignation', 'exit process'], 0.9),
            ],
            'attendance_correction': [
                (['attendance correction', 'correct attendance', 'fix attendance', 'wrong attendance', 'mark attendance'], 0.9),
                (['regularize attendance', 'attendance regularization', 'missed check in', 'missed check out'], 0.85),
            ],
            'expense_claim': [
                (['expense', 'reimbursement', 'claim', 'travel expense', 'medical expense', 'submit expense'], 0.9),
                (['reimburse', 'expense report', 'expense claim', 'bill reimbursement'], 0.85),
            ],
            'asset_request': [
                (['need laptop', 'need device', 'asset request', 'equipment request', 'new laptop', 'replace laptop'], 0.9),
                (['request asset', 'asset allocation', 'device allocation', 'hardware request'], 0.85),
            ],
            'grievance': [
                (['grievance', 'complaint', 'harassment', 'discrimination', 'workplace issue', 'report issue'], 0.9),
                (['file complaint', 'raise grievance', 'report problem', 'escalate issue'], 0.85),
            ],
            'performance_review': [
                (['performance review', 'appraisal', 'performance evaluation', 'feedback', 'self review'], 0.9),
                (['review meeting', 'performance meeting', 'goal setting', 'kpi review'], 0.85),
            ],
            'recruitment': [
                (['referral', 'refer candidate', 'referral bonus', 'referral policy', 'job opening', 'vacancy'], 0.9),
                (['referral status', 'referral tracking', 'candidate referral'], 0.85),
            ],
            'company_query': [
                (['company', 'organization', 'about company', 'company details', 'our company', 'company info'], 0.9),
                (['company policy', 'company details', 'organization structure', 'company overview'], 0.85),
            ],
            'policy_query': [
                (['policy', 'guidelines', 'rules', 'handbook', 'procedure', 'standard operating procedure'], 0.9),
                (['company policy', 'hr policy', 'leave policy', 'attendance policy', 'code of conduct'], 0.85),
            ],
            'onboarding_query': [
                (['onboarding', 'joining process', 'new hire', 'orientation', 'joining formalities'], 0.9),
                (['onboarding status', 'joining tasks', 'new employee process'], 0.85),
            ],
            'help': [
                (['help', 'what can you', 'assist', 'support', 'guide', 'how to', 'instructions'], 0.95),
                (['features', 'capabilities', 'commands', 'options'], 0.9),
            ],
            'goodbye': [
                (['bye', 'goodbye', 'see you', 'exit', 'quit', 'end'], 0.95),
                (['thank you', 'thanks', 'thank'], 0.7),
            ],
        }
    
    def _load_entity_patterns(self) -> Dict[str, List[str]]:
        return {
            'date': [
                r'\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b',
                r'\b(today|tomorrow|yesterday|day after tomorrow)\b',
                r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b',
                r'\b(next week|next month|this month|last month)\b',
            ],
            'employee_name': [
                r'(?:find|search|lookup|who is|tell me about|show me|locate|details of)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)',
                r'employee\s+([A-Za-z]+)',
            ],
            'department_name': [
                r'(?:department|team|who is in|members of|people in|staff in|employees in)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)',
            ],
            'leave_type': [
                r'\b(annual|sick|casual|maternity|paternity|bereavement|compensatory|comp off)\b',
            ],
            'number': [
                r'\b\d+(?:\.\d+)?\b',
            ],
            'email': [
                r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b',
            ],
            'expense_type': [
                r'\b(travel|medical|food|transport|accommodation|office|other)\b',
            ],
            'asset_type': [
                r'\b(laptop|desktop|monitor|keyboard|mouse|phone|tablet|docking station|headphone|camera)\b',
            ],
            'grievance_type': [
                r'\b(harassment|discrimination|safety|workload|manager|colleague|pay|policy|other)\b',
            ],
        }
    
    def _load_response_templates(self) -> Dict[str, List[str]]:
        return {
            'greeting': [
                "Hello! I'm your Enterprise HR Assistant. I can help you with leave, attendance, payroll, expenses, assets, grievances, resignation, and more. What would you like to do?",
                "Hi there! I'm your virtual HR assistant. I can help with leave applications, attendance, payroll, expense claims, asset requests, and much more. How can I help you today?",
                "Greetings! I'm here to assist with all your HR needs. You can ask me about leave, attendance, payroll, expenses, assets, or any other HR-related query. What would you like to know?",
            ],
            'leave_balance_query': [
                "I can help you check your leave balance. Let me fetch that information for you.",
                "Your leave balance information is available. Let me check it for you.",
            ],
            'leave_application': [
                "I can help you apply for leave. Please provide the start date, end date, and leave type.",
                "To apply for leave, I'll need: start date, end date, and the type of leave. I can also help you draft a leave request email.",
            ],
            'leave_history_query': [
                "I can show you your leave history. Let me fetch your recent leave applications.",
                "Your leave history is available. I can show you your recent leave applications and their status.",
            ],
            'attendance_query': [
                "I can show you your attendance summary for this month.",
                "Your attendance records are available. I can show you a detailed summary including present days, absent days, and late arrivals.",
            ],
            'attendance_correction': [
                "I can help you request an attendance correction. Please provide the date and the correct attendance details.",
                "Attendance correction requests can be submitted through me. Please provide the date and what needs to be corrected.",
            ],
            'payroll_query': [
                "I can show you your payroll summary and payslip details.",
                "Payroll information is available. I can show your latest payslip, salary breakdown, and help with tax forms.",
            ],
            'employee_search': [
                "I can help you search for employees. Please provide a name, email, or employee code.",
                "Employee search is available. Who are you looking for? I can search by name, email, department, or designation.",
            ],
            'department_roster': [
                "I can show you employees in a department. Which department are you interested in?",
                "I can list department members. Please specify the department name.",
            ],
            'team_view': [
                "I can show you your team members and their details.",
                "Your team overview is available. I can show you team members, their attendance, and leave status.",
            ],
            'company_query': [
                "I can provide you with information about {company_name}. What would you like to know?",
                "Here's what I can tell you about {company_name}: company overview, departments, policies, and more.",
            ],
            'policy_query': [
                "I can help you find HR policies for {company_name}. Which policy are you looking for?",
                "HR policies are available. I can help you with leave policy, attendance policy, expense policy, and more for {company_name}.",
            ],
            'onboarding_query': [
                "I can check your onboarding status and show pending tasks.",
                "Onboarding assistance is available. I can guide you through the complete onboarding process.",
            ],
            'asset_query': [
                "I can help you with asset requests. What type of asset do you need?",
                "Asset management assistance is available. I can help you request new assets or check your current allocations.",
            ],
            'resignation': [
                "I understand you want to resign. I can guide you through the resignation process, generate the resignation email, and help with exit formalities.",
                "Resignation process: I can help you draft the resignation email, calculate your notice period, and guide you through exit formalities.",
            ],
            'expense_claim': [
                "I can help you submit an expense claim. Please provide the expense type, amount, and date.",
                "Expense claims can be submitted through me. I can help you with travel, medical, and other expense reimbursements.",
            ],
            'grievance': [
                "I can help you file a grievance. Please describe the issue and I'll guide you through the process.",
                "Grievance filing is available. I can help you report workplace issues, harassment, discrimination, or other concerns.",
            ],
            'performance_review': [
                "I can help you with performance reviews. I can show your review history or help you prepare for a review meeting.",
                "Performance management assistance is available. I can help you with self-reviews, goal setting, and feedback.",
            ],
            'recruitment': [
                "I can help you with employee referrals and job openings. Would you like to refer someone or check referral status?",
                "Recruitment assistance is available. I can help you refer candidates and track referral status.",
            ],
            'help': [
                "I'm your virtual HR assistant. I can help with:\n"
                "• Leave: check balance, apply, cancel, history\n"
                "• Attendance: view summary, request correction\n"
                "• Payroll: payslips, tax forms, salary details\n"
                "• Expenses: submit claims, track reimbursements\n"
                "• Assets: request equipment, view allocations\n"
                "• Resignation: draft email, exit formalities\n"
                "• Grievances: file complaints, track status\n"
                "• Policies: leave, attendance, expense, code of conduct\n"
                "• Onboarding: check status, complete tasks\n"
                "• Team: view members, attendance, leave\n"
                "• Documents: generate offer letter, experience letter, etc.\n\n"
                "What would you like to do?",
                "Here's what I can help you with:\n"
                "1. Leave management (balance, apply, cancel)\n"
                "2. Attendance tracking and corrections\n"
                "3. Payroll and tax documents\n"
                "4. Expense claims and reimbursements\n"
                "5. Asset requests and allocations\n"
                "6. Resignation and exit process\n"
                "7. Grievance filing and tracking\n"
                "8. HR policies and procedures\n"
                "9. Onboarding assistance\n"
                "10. Team management (for managers)\n"
                "11. Document generation (letters, certificates)\n"
                "12. Employee search and information\n\n"
                "Just ask me in simple language!",
            ],
            'default': [
                "I understand you're asking about HR matters. Could you please be more specific? I can help with leave, attendance, payroll, expenses, assets, resignation, grievances, and more.",
                "I'm here to help with all HR-related queries. You can ask me about leave balance, attendance, payroll, expense claims, asset requests, resignation, or any other HR task.",
                "I can assist with various HR tasks. Please let me know what specific information you need. For example: 'Apply for leave', 'Check attendance', 'Submit expense claim', 'Request laptop', etc.",
            ],
        }
    
    def classify_intent(self, message: str) -> Tuple[str, float]:
        """Classify user intent with confidence score"""
        msg_lower = message.lower().strip()
        words = self._tokenize(msg_lower)
        
        # Entity-driven override: if a name is mentioned with a search verb, force employee_search
        entities = self.extract_entities(message)
        search_verbs = ['find', 'search', 'lookup', 'locate', 'who is', 'show me', 'tell me about', 'details of', 'where is']
        has_name = bool(entities.get('employee_name'))
        has_dept = bool(entities.get('department_name'))
        has_search_verb = any(v in msg_lower for v in search_verbs)
        
        if has_dept and ('department' in msg_lower or 'team in' in msg_lower or 'who is in' in msg_lower or 'members of' in msg_lower or 'people in' in msg_lower or 'staff in' in msg_lower or 'employees in' in msg_lower):
            return 'department_roster', 0.9
        
        if has_name and has_search_verb:
            return 'employee_search', 0.85
        
        best_intent = 'general'
        best_score = 0.0
        
        for intent, patterns in self.intent_patterns.items():
            for keywords, base_score in patterns:
                matches = sum(1 for kw in keywords if re.search(r'\b' + re.escape(kw) + r'\b', msg_lower))
                if matches > 0:
                    score = base_score * (0.5 + 0.5 * min(matches / len(keywords), 1.0))
                    # Boost for exact phrase matches
                    for kw in keywords:
                        if kw in msg_lower:
                            score += 0.1
                    score = min(score, 1.0)
                    
                    if score > best_score:
                        best_score = score
                        best_intent = intent
        
        # Normalize score
        if best_score < 0.3:
            best_intent = 'general'
            best_score = 0.5
        
        return best_intent, best_score
    
    def extract_entities(self, message: str) -> Dict[str, Any]:
        """Extract entities from message"""
        entities = {}
        stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                      'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
                      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
                      'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
                      'under', 'again', 'further', 'then', 'once', 'all', 'any', 'both',
                      'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
                      'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
                      'because', 'but', 'and', 'or', 'if', 'while', 'about', 'against',
                      'my', 'your', 'his', 'her', 'its', 'our', 'their', 'what', 'which',
                      'who', 'whom', 'this', 'that', 'these', 'those', 'i', 'me', 'we',
                      'you', 'he', 'she', 'it', 'they', 'leave', 'attendance', 'salary',
                      'payroll', 'policy', 'balance', 'history', 'today', 'tomorrow'}
        
        for entity_type, patterns in self.entity_patterns.items():
            for pattern in patterns:
                matches = re.findall(pattern, message, re.IGNORECASE)
                if matches:
                    if entity_type not in entities:
                        entities[entity_type] = []
                    if entity_type in ('employee_name', 'department_name'):
                        for m in matches:
                            name = m.strip()
                            if name.lower() not in stop_words and len(name) > 1:
                                entities[entity_type].append(name)
                    else:
                        entities[entity_type].extend(matches)
        
        # Normalize dates
        if 'date' in entities:
            entities['normalized_dates'] = []
            for date_str in entities['date']:
                normalized = self._normalize_date(date_str)
                if normalized:
                    entities['normalized_dates'].append(normalized)
        
        return entities
    
    def extract_action_parameters(
        self,
        message: str,
        intent: str,
        entities: Dict[str, Any],
        context: AIContext,
    ) -> Optional[Tuple[str, Dict[str, Any]]]:
        """Extract action and parameters from message"""
        msg_lower = message.lower()
        
        # Greeting
        if intent == 'greeting':
            return None
        
        # Goodbye
        if intent == 'goodbye':
            return None
        
        # Help
        if intent == 'help':
            return None
        
        # Leave balance
        if intent == 'leave_balance_query':
            return 'check_leave_balance', {'employee_id': context.employee_id}
        
        # Leave application
        if intent == 'leave_application':
            params = {'employee_id': context.employee_id}
            
            # Extract dates
            dates = entities.get('normalized_dates', [])
            if len(dates) >= 2:
                params['start_date'] = dates[0]
                params['end_date'] = dates[1]
            elif len(dates) == 1:
                params['start_date'] = dates[0]
                params['end_date'] = dates[0]
            
            # Extract leave type
            leave_types = entities.get('leave_type', [])
            if leave_types:
                params['leave_type'] = leave_types[0]
            
            # Extract reason
            reason_match = re.search(r'(?:because|for|due to|reason)\s+(.+?)(?:\.|$)', msg_lower)
            if reason_match:
                params['reason'] = reason_match.group(1).strip()
            
            return 'apply_leave', params
        
        # Leave history
        if intent == 'leave_history_query':
            return 'view_leave_history', {'employee_id': context.employee_id}
        
        # Attendance
        if intent == 'attendance_query':
            params = {'employee_id': context.employee_id}
            period = 'current_month'
            if 'week' in msg_lower:
                period = 'current_week'
            elif 'today' in msg_lower:
                period = 'today'
            params['period'] = period
            return 'view_attendance', params
        
        # Attendance correction
        if intent == 'attendance_correction':
            params = {'employee_id': context.employee_id}
            dates = entities.get('normalized_dates', [])
            if dates:
                params['date'] = dates[0]
            return 'request_attendance_correction', params
        
        # Payroll
        if intent == 'payroll_query':
            params = {'employee_id': context.employee_id}
            if 'download' in msg_lower or 'tax' in msg_lower:
                return 'download_tax_form', params
            return 'view_payroll_summary', params
        
        # Employee search
        if intent == 'employee_search':
            query = message
            for prefix in ['find employee', 'search employee', 'lookup employee', 'who is', 'tell me about', 'employee details', 'find', 'search', 'lookup', 'locate', 'show me', 'details of', 'where is']:
                if prefix in msg_lower:
                    query = message[len(prefix):].strip()
                    break
            # If entity extraction found a name, prefer that
            name_entities = entities.get('employee_name', [])
            if name_entities:
                query = name_entities[0]
            
            if query and len(query) > 1:
                return 'search_employees', {'query': query}
            return 'search_employees', {'query': ''}
        
        # Department roster
        if intent == 'department_roster':
            dept_entities = entities.get('department_name', [])
            dept_name = dept_entities[0] if dept_entities else ''
            # Try to extract department name from message after keywords
            if not dept_name:
                for keyword in ['department of ', 'team of ', 'who is in ', 'members of ', 'people in ', 'staff in ', 'employees in ', 'in the ', 'in ']:
                    if keyword in msg_lower:
                        idx = msg_lower.index(keyword) + len(keyword)
                        dept_name = message[idx:].strip()
                        break
            return 'search_employees_by_department', {'department_name': dept_name}
        
        # Team view
        if intent == 'team_view':
            return 'view_team', {'manager_id': context.employee_id}
        
        # Policy lookup
        if intent == 'policy_query':
            policy_type = 'general'
            if 'leave' in msg_lower:
                policy_type = 'leave'
            elif 'attendance' in msg_lower:
                policy_type = 'attendance'
            elif 'payroll' in msg_lower:
                policy_type = 'payroll'
            elif 'code' in msg_lower or 'conduct' in msg_lower:
                policy_type = 'code_of_conduct'
            elif 'remote' in msg_lower or 'wfh' in msg_lower:
                policy_type = 'remote_work'
            elif 'expense' in msg_lower:
                policy_type = 'expense'
            elif 'asset' in msg_lower:
                policy_type = 'asset'
            elif 'grievance' in msg_lower:
                policy_type = 'grievance'
            elif 'performance' in msg_lower:
                policy_type = 'performance'
            return 'lookup_policy', {'policy_type': policy_type}
        
        # Onboarding
        if intent == 'onboarding_query':
            return 'check_onboarding_status', {'employee_id': context.employee_id}
        
        # Assets
        if intent == 'asset_query':
            if 'request' in msg_lower or 'need' in msg_lower:
                asset_types = entities.get('asset_type', [])
                return 'request_asset', {'employee_id': context.employee_id, 'asset_type': asset_types[0] if asset_types else 'laptop'}
            return 'view_asset_allocations', {'employee_id': context.employee_id}
        
        # Resignation
        if intent == 'resignation':
            return 'initiate_resignation', {'employee_id': context.employee_id}
        
        # Expense claim
        if intent == 'expense_claim':
            expense_types = entities.get('expense_type', [])
            return 'create_expense_claim', {'employee_id': context.employee_id, 'expense_type': expense_types[0] if expense_types else 'general'}
        
        # Company query
        if intent == 'company_query':
            return 'lookup_company', {'company_id': context.company_id}
        
        # Grievance
        if intent == 'grievance':
            grievance_types = entities.get('grievance_type', [])
            return 'file_grievance', {'employee_id': context.employee_id, 'grievance_type': grievance_types[0] if grievance_types else 'general'}
        
        # Performance review
        if intent == 'performance_review':
            return 'view_performance_reviews', {'employee_id': context.employee_id}
        
        # Recruitment/referral
        if intent == 'recruitment':
            if 'refer' in msg_lower:
                return 'refer_candidate', {'employee_id': context.employee_id}
            return 'view_job_openings', {}
        
        return None
    
    def generate_response(
        self,
        message: str,
        intent: str,
        confidence: float,
        context: AIContext,
        action_result: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Generate response based on intent and context"""
        
        # If action was executed successfully, use its message
        if action_result and action_result.get('success'):
            return action_result.get('message', '')
        
        # If action failed, use error message
        if action_result and not action_result.get('success'):
            return action_result.get('message', 'I encountered an issue processing your request.')
        
        # Industry and role context
        industry = context.industry or 'general'
        role = context.role or 'employee'
        
        # Get response template
        templates = self.response_templates.get(intent, self.response_templates['default'])
        base_response = templates[hash(message) % len(templates)]
        
        # Enhance with context
        if intent == 'greeting':
            if role == 'manager':
                base_response = f"Hello! I'm your HR Assistant. You have manager-level access. I can help with team information, approvals, and HR queries."
            elif role in ['hr_admin', 'admin']:
                base_response = f"Hello! I'm your HR Assistant. You have admin-level access. I can help with HR operations, reports, and employee management."
        
        elif intent == 'leave_balance_query':
            base_response = "I can help you check your leave balance. Let me fetch that information for you."
        
        elif intent == 'payroll_query':
            base_response = "I can show you your payroll summary and payslip details."
        
        elif intent == 'attendance_query':
            base_response = "I can show you your attendance summary for this month."
        
        elif intent == 'employee_search':
            base_response = "I can help you search for employees. Please provide a name or email address."
        
        elif intent == 'team_view':
            base_response = "I can show you your team members and their details."
        
        elif intent == 'policy_query':
            base_response = "I can help you find HR policies. Which policy are you looking for?"
        
        elif intent == 'onboarding_query':
            base_response = "I can check your onboarding status and show pending tasks."
        
        elif intent == 'help':
            features = [
                "• Check leave balance and apply for leave",
                "• View attendance summary",
                "• Show payroll and payslips",
                "• Search for employees",
                "• View team information",
                "• Look up HR policies",
            ]
            if role in ['hr_admin', 'admin', 'manager']:
                features.extend([
                    "• Approve leave requests",
                    "• Generate reports",
                    "• Manage team attendance",
                ])
            base_response = "I can help you with:\n" + "\n".join(features) + "\n\nWhat would you like to know?"
        
        elif intent == 'general':
            if confidence < 0.4:
                base_response = "I'm not sure I understand. Could you please rephrase? I can help with employee search, leave, attendance, payroll, department queries, and more. Try: 'Find Tirna' or 'Who is in HR department?'"
            else:
                base_response = "I can help you with:\n• Employee search — try 'Find [name]' or 'Who is [name]?'\n• Department queries — try 'Who is in HR department?'\n• Leave balance and applications\n• Attendance records\n• Payroll and payslips\n• Expense claims\n• Company policies\n\nWhat would you like to know?"
        
        return base_response
    
    def get_suggestions(self, intent: str, context: AIContext) -> List[str]:
        """Get contextual suggestions"""
        role = context.role or 'employee'
        
        base_suggestions = {
            'greeting': ["Find employee", "Who is in HR department?", "Check my leave balance", "View my attendance", "Download payslip", "Submit expense claim"],
            'leave_balance_query': ["Apply for leave", "Leave history", "Leave policy", "Cancel leave"],
            'leave_application': ["Check balance first", "Leave policy", "Cancel leave"],
            'leave_history_query': ["Apply for leave", "Leave balance", "Leave policy"],
            'attendance_query': ["Request correction", "Mark attendance", "Monthly report"],
            'attendance_correction': ["View attendance", "Attendance policy", "Mark attendance"],
            'payroll_query': ["Download payslip", "Tax forms", "Salary breakdown"],
            'employee_search': ["View profile", "Contact info", "Department"],
            'department_roster': ["Find employee", "Department details", "Team members"],
            'team_view': ["Attendance summary", "Leave approvals", "Performance"],
            'policy_query': ["Leave policy", "Attendance policy", "Expense policy", "Code of conduct"],
            'onboarding_query': ["View tasks", "IT setup", "Orientation schedule"],
            'asset_query': ["Request asset", "Return asset", "Asset policy"],
            'resignation': ["Exit formalities", "Notice period", "Relieving letter"],
            'expense_claim': ["Expense policy", "Track claim", "Reimbursement status"],
            'grievance': ["Grievance policy", "Track status", "Contact HR"],
            'performance_review': ["Self review", "Goal setting", "Review history"],
            'recruitment': ["Refer candidate", "Job openings", "Referral policy"],
            'help': ["Leave management", "Payroll info", "Attendance", "Expense claims", "Asset requests", "Resignation help"],
        }
        
        suggestions = base_suggestions.get(intent, ["Leave balance", "Attendance", "Payroll", "Expense claims", "Asset requests", "Help"])
        
        # Role-based filtering
        if role == 'employee':
            suggestions = [s for s in suggestions if s not in ["Approve leave requests", "Generate reports", "Manage team attendance"]]
        
        return suggestions[:4]
    
    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenizer"""
        words = re.findall(r'\b[a-z0-9]+\b', text.lower())
        return [w for w in words if w not in self.stop_words and len(w) > 1]
    
    def _normalize_date(self, date_str: str) -> Optional[str]:
        """Normalize date string to ISO format"""
        date_str = date_str.lower().strip()
        
        today = datetime.now().date()
        
        if date_str == 'today':
            return today.isoformat()
        elif date_str == 'tomorrow':
            return (today + timedelta(days=1)).isoformat()
        elif date_str == 'yesterday':
            return (today - timedelta(days=1)).isoformat()
        elif date_str == 'day after tomorrow':
            return (today + timedelta(days=2)).isoformat()
        
        # Try parsing common formats
        for fmt in ['%d/%m/%Y', '%m/%d/%Y', '%Y-%m-%d', '%d-%m-%Y']:
            try:
                return datetime.strptime(date_str, fmt).date().isoformat()
            except ValueError:
                continue
        
        return None
    
    def get_system_prompt(self, context: AIContext) -> str:
        """Build system prompt"""
        return build_system_prompt(
            industry=context.industry,
            role=context.role,
            country=context.country,
        )


# Singleton
_nlp_engine: Optional[LocalNLPEngine] = None


def get_nlp_engine() -> LocalNLPEngine:
    global _nlp_engine
    if _nlp_engine is None:
        _nlp_engine = LocalNLPEngine()
    return _nlp_engine
