"""
HRMS AI Context Builder
Builds rich context for AI interactions from user, tenant, and conversation data
"""
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from hrms_ai.schemas import AIContext
from hrms_ai.knowledge import get_knowledge_base, KnowledgeType
from hrms_ai.prompts import build_system_prompt


class AIContextBuilder:
    """Builds comprehensive context for HRMS AI interactions"""
    
    def __init__(self, db_session_factory=None):
        self.db_session_factory = db_session_factory
        self.knowledge_base = get_knowledge_base()
    
    def _get_db(self):
        if self.db_session_factory:
            return self.db_session_factory()
        return None
    
    async def build_context(
        self,
        user_id: str,
        organization_id: Optional[int] = None,
        company_id: Optional[int] = None,
        role: Optional[str] = None,
        employee_id: Optional[int] = None,
        department_id: Optional[int] = None,
        designation: Optional[str] = None,
        conversation_history: Optional[List[Dict[str, Any]]] = None,
        query: Optional[str] = None,
        db_session=None,
    ) -> AIContext:
        """Build comprehensive AI context with company awareness"""
        
        db = db_session or self._get_db()
        owns_session = db_session is None
        try:
            enriched_data = await self._enrich_from_db(
                db, user_id, organization_id, employee_id, role
            )
            
            if enriched_data:
                organization_id = organization_id or enriched_data.get("organization_id")
                company_id = company_id or enriched_data.get("company_id")
                role = role or enriched_data.get("role")
                employee_id = employee_id or enriched_data.get("employee_id")
                department_id = department_id or enriched_data.get("department_id")
                designation = designation or enriched_data.get("designation")
            
            company_name = None
            company_code = None
            department_name = None
            organization_name = None
            industry = None
            country = None
            company_settings = {}
            
            if db:
                try:
                    from models import Organization, Company, Department
                    
                    if organization_id:
                        org = db.query(Organization).filter(Organization.id == organization_id).first()
                        if org:
                            organization_name = org.name
                            industry = getattr(org, "industry", None)
                            country = getattr(org, "country", None)
                            
                            if not company_id and hasattr(org, 'company_id') and org.company_id:
                                company_id = org.company_id
                            
                            companies = db.query(Company).filter(
                                Company.organization_id == organization_id,
                                Company.deleted_at == None,
                            ).all()
                            
                            company_list = [
                                {
                                    "id": c.id,
                                    "name": c.name,
                                    "code": c.code,
                                    "industry": getattr(c, "industry", None),
                                    "country": getattr(c, "country", None),
                                    "status": getattr(c, "status", "active"),
                                }
                                for c in companies
                            ]
                    
                    if company_id:
                        company = db.query(Company).filter(Company.id == company_id).first()
                        if company:
                            company_name = company.name
                            company_code = company.code
                            
                            if hasattr(company, 'settings') and company.settings:
                                company_settings = company.settings if isinstance(company.settings, dict) else {}
                            
                            if not industry:
                                industry = getattr(company, 'industry', None)
                    
                    if department_id:
                        dept = db.query(Department).filter(Department.id == department_id).first()
                        if dept:
                            department_name = dept.name
                except Exception:
                    pass
            
            recent_actions = []
            if conversation_history:
                for entry in conversation_history[-10:]:
                    if entry.get("role") == "assistant" and entry.get("actions"):
                        recent_actions.extend(entry["actions"])
            
            context = AIContext(
                user_id=user_id,
                employee_id=employee_id,
                organization_id=organization_id,
                company_id=company_id,
                company_name=company_name,
                company_code=company_code,
                role=role or "employee",
                department_id=department_id,
                department_name=department_name,
                designation=designation,
                permissions=self._get_permissions(role),
                industry=industry,
                country=country,
                organization_name=organization_name,
                company_settings=company_settings,
                conversation_history=conversation_history or [],
                recent_actions=recent_actions,
            )
            
            return context
        finally:
            if owns_session and db:
                db.close()
    
    async def _enrich_from_db(
        self, db, user_id: str, organization_id: Optional[int], employee_id: Optional[int], role: Optional[str]
    ) -> Optional[Dict[str, Any]]:
        """Enrich context with data from database"""
        if not db:
            return None
        
        try:
            from models import User, Employee
            
            # Try to find user
            user = None
            if user_id.isdigit():
                user = db.query(User).filter(User.id == int(user_id)).first()
            if not user:
                user = db.query(User).filter(User.email == user_id).first()
            if not user:
                user = db.query(User).filter(User.user_id == user_id).first()
            
            if not user:
                return None
            
            # Find employee record
            employee = None
            if user.id:
                employee = db.query(Employee).filter(
                    Employee.user_id == user.id,
                    Employee.deleted_at == None,
                ).first()
            
            return {
                "organization_id": organization_id or user.organization_id,
                "company_id": employee.company_id if employee else None,
                "role": role or user.role,
                "employee_id": employee_id or (employee.id if employee else None),
                "department_id": employee.department_id if employee else None,
                "designation": employee.designation if employee else None,
            }
        except Exception:
            return None
    
    def _get_permissions(self, role: Optional[str]) -> List[str]:
        """Get permissions for a role"""
        role_permissions = {
            "superadmin": ["read_all", "write_all", "admin", "audit", "configure"],
            "admin": ["read_all", "write_all", "admin", "configure"],
            "hr_admin": ["read_all", "write_all", "approve", "configure_hr"],
            "hr_manager": ["read_all", "approve", "view_reports", "manage_team"],
            "hr_executive": ["read_all", "process", "view_reports"],
            "employee": ["read_own", "write_own", "apply"],
            "manager": ["read_team", "approve_team", "manage_team"],
        }
        
        if not role:
            return role_permissions.get("employee", [])
        
        return role_permissions.get(role.lower(), role_permissions.get("employee", []))
    
    def get_system_prompt(self, context: AIContext) -> str:
        """Build system prompt for the AI"""
        return build_system_prompt(
            industry=context.industry,
            role=context.role,
            country=context.country,
        )
    
    async def get_relevant_knowledge(
        self,
        tenant_id: str,
        query: str,
        max_docs: int = 3,
    ) -> List[Dict[str, Any]]:
        """Retrieve relevant knowledge base documents"""
        if not query:
            return []
        
        return self.knowledge_base.search(
            tenant_id=tenant_id,
            query=query,
            n_results=max_docs,
            min_score=0.3,
        )
    
    def build_action_context(
        self,
        context: AIContext,
        action: str,
        parameters: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Build context for action execution"""
        return {
            "user_id": context.user_id,
            "employee_id": context.employee_id,
            "organization_id": context.organization_id,
            "company_id": context.company_id,
            "role": context.role,
            "department_id": context.department_id,
            "designation": context.designation,
            "permissions": context.permissions,
            "action": action,
            "parameters": parameters,
            "timestamp": datetime.now().isoformat(),
        }
