"""
Custom exceptions for HRMS AI
"""


class HRMSAIException(Exception):
    """Base exception for HRMS AI"""
    pass


class AIProviderUnavailableError(HRMSAIException):
    """Raised when all AI providers are unavailable"""
    pass


class AIPermissionError(HRMSAIException):
    """Raised when AI action is not permitted for user role"""
    pass


class AITenantIsolationError(HRMSAIException):
    """Raised when tenant isolation is violated"""
    pass


class AIActionExecutionError(HRMSAIException):
    """Raised when an AI action fails to execute"""
    pass


class AIEscalationRequiredError(HRMSAIException):
    """Raised when AI needs to escalate to human"""
    pass


class AIKnowledgeBaseError(HRMSAIException):
    """Raised when knowledge base operations fail"""
    pass


class AIContextError(HRMSAIException):
    """Raised when required context is missing"""
    pass
