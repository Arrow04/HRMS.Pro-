"""
Local Inference Provider for HRMS AI
Fully local response generation without any external API
"""
from typing import Optional, Dict, Any, List, AsyncGenerator
from dataclasses import dataclass

from hrms_ai.nlp import get_nlp_engine
from hrms_ai.retrieval import get_retrieval_engine
from hrms_ai.prompts import build_system_prompt


@dataclass
class LLMResponse:
    text: str
    provider: str
    model: str
    tokens_used: Optional[int] = None
    latency_ms: Optional[int] = None
    finish_reason: Optional[str] = None


class LocalInferenceProvider:
    """Fully local inference using NLP engine and retrieval"""
    
    def __init__(self):
        self.available = True
        self.provider_name = "local_hrms_ai"
        self.model_name = "hrms-local-v1"
        self.nlp_engine = get_nlp_engine()
        self.retrieval_engine = get_retrieval_engine()
    
    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 1024,
        context: Optional[Dict[str, Any]] = None,
    ) -> LLMResponse:
        """Generate response using local NLP engine"""
        try:
            context = context or {}
            user_message = prompt
            
            # Classify intent
            intent, confidence = self.nlp_engine.classify_intent(user_message)
            
            # Extract entities
            entities = self.nlp_engine.extract_entities(user_message)
            
            # Build AIContext for response generation
            from hrms_ai.schemas import AIContext
            ai_context = AIContext(
                user_id=context.get('user_id', ''),
                employee_id=context.get('employee_id'),
                organization_id=context.get('organization_id'),
                company_id=context.get('company_id'),
                role=context.get('role', 'employee'),
                department_id=context.get('department_id'),
                designation=context.get('designation'),
                permissions=context.get('permissions', []),
                industry=context.get('industry'),
                country=context.get('country'),
                conversation_history=context.get('conversation_history', []),
                recent_actions=context.get('recent_actions', []),
            )
            
            # Check if action should be extracted
            action_tuple = self.nlp_engine.extract_action_parameters(
                user_message, intent, entities, ai_context
            )
            
            action_result = None
            if action_tuple:
                action_name, action_params = action_tuple
                # Execute action if possible
                try:
                    from hrms_ai.actions import AIActionExecutor
                    from hrms_ai.schemas import AIContext
                    
                    executor = AIActionExecutor()
                    action_result = executor.execute(
                        action=action_name,
                        parameters=action_params,
                        context=ai_context,
                    )
                except Exception:
                    action_result = None
            
            # Generate response
            response_text = self.nlp_engine.generate_response(
                message=user_message,
                intent=intent,
                confidence=confidence,
                context=ai_context,
                action_result=action_result,
            )
            
            # Enhance with retrieval context if needed
            if intent in ('policy_query', 'general') and not action_result:
                tenant_id = str(ai_context.organization_id) if ai_context.organization_id else 'default'
                context_str = self.retrieval_engine.build_context_string(
                    tenant_id=tenant_id,
                    query=user_message,
                    max_docs=2,
                )
                if context_str:
                    response_text = f"{response_text}\n\n{context_str}"
            
            return LLMResponse(
                text=response_text,
                provider=self.provider_name,
                model=self.model_name,
                tokens_used=len(user_message.split()) + len(response_text.split()),
                latency_ms=0,
                finish_reason="stop",
            )
            
        except Exception as e:
            return LLMResponse(
                text=f"I encountered an error processing your request: {str(e)}",
                provider=self.provider_name,
                model=self.model_name,
                finish_reason="error",
            )
    
    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 1024,
        context: Optional[Dict[str, Any]] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream response word by word"""
        response = await self.generate(prompt, system_prompt, temperature, max_tokens, context)
        
        words = response.text.split()
        for i, word in enumerate(words):
            yield word + " "
            await __import__('asyncio').sleep(0.02)
    
    def get_system_prompt(self, context: Dict[str, Any]) -> str:
        """Build system prompt from context"""
        return build_system_prompt(
            industry=context.get('industry'),
            role=context.get('role'),
            country=context.get('country'),
        )
    
    def classify_intent(self, message: str) -> tuple[str, float]:
        """Classify intent using local NLP"""
        return self.nlp_engine.classify_intent(message)
    
    def extract_entities(self, message: str) -> Dict[str, Any]:
        """Extract entities using local NLP"""
        return self.nlp_engine.extract_entities(message)


class LocalProviderManager:
    """Manager for local providers"""
    
    def __init__(self):
        self.providers = [LocalInferenceProvider()]
        self.provider_names = ["local_hrms_ai"]
    
    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 1024,
        context: Optional[Dict[str, Any]] = None,
    ) -> LLMResponse:
        """Generate with local provider"""
        provider = self.providers[0]
        return await provider.generate(prompt, system_prompt, temperature, max_tokens, context)
    
    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        temperature: float = 0.7,
        max_tokens: int = 1024,
        context: Optional[Dict[str, Any]] = None,
    ) -> AsyncGenerator[str, None]:
        """Stream with local provider"""
        provider = self.providers[0]
        async for chunk in provider.generate_stream(prompt, system_prompt, temperature, max_tokens, context):
            yield chunk
    
    def get_available_providers(self) -> List[str]:
        return self.provider_names
    
    def get_primary_provider(self):
        return self.providers[0] if self.providers else None
