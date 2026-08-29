"""
Enterprise-grade input validation and sanitization
Prevents SQL injection, XSS, and other security vulnerabilities
"""
import re
from typing import Any, Optional
from html import escape
import bleach
from email_validator import validate_email, EmailNotValidError

class InputValidator:
    """Centralized input validation and sanitization"""
    
    # SQL injection patterns
    SQL_INJECTION_PATTERNS = [
        r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|UNION)\b)",
        r"(--|;|\/\*|\*\/)",
        r"(\bOR\b.*=.*=)",
        r"(\bAND\b.*=.*=)",
        r"(\bWHERE\b.*\b1\b.*=.*\b1\b)",
    ]
    
    # XSS patterns
    XSS_PATTERNS = [
        r"<script.*?>.*?</script>",
        r"javascript:",
        r"on\w+\s*=",
        r"<iframe.*?>",
        r"<object.*?>",
        r"<embed.*?>",
    ]
    
    @staticmethod
    def sanitize_string(input_string: str, max_length: int = 1000) -> str:
        """Sanitize string input"""
        if not input_string:
            return ""
        
        # Truncate to max length
        input_string = input_string[:max_length]
        
        # Escape HTML entities
        sanitized = escape(input_string)
        
        # Remove potentially dangerous characters
        sanitized = bleach.clean(sanitized, tags=[], attributes={}, strip=True)
        
        return sanitized
    
    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email format"""
        try:
            validate_email(email)
            return True
        except EmailNotValidError:
            return False
    
    @staticmethod
    def validate_phone(phone: str) -> bool:
        """Validate phone number format"""
        # Allow international formats: +1234567890, 123-456-7890, (123) 456-7890
        pattern = r'^\+?[\d\s\-\(\)]{10,20}$'
        return bool(re.match(pattern, phone))
    
    @staticmethod
    def detect_sql_injection(input_string: str) -> bool:
        """Detect potential SQL injection attempts"""
        if not input_string:
            return False
        
        for pattern in InputValidator.SQL_INJECTION_PATTERNS:
            if re.search(pattern, input_string, re.IGNORECASE):
                return True
        return False
    
    @staticmethod
    def detect_xss(input_string: str) -> bool:
        """Detect potential XSS attempts"""
        if not input_string:
            return False
        
        for pattern in InputValidator.XSS_PATTERNS:
            if re.search(pattern, input_string, re.IGNORECASE):
                return True
        return False
    
    @staticmethod
    def sanitize_numeric(input_value: Any, min_value: Optional[int] = None, max_value: Optional[int] = None) -> Optional[int]:
        """Sanitize and validate numeric input"""
        try:
            value = int(input_value)
            
            if min_value is not None and value < min_value:
                return min_value
            if max_value is not None and value > max_value:
                return max_value
            
            return value
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def sanitize_id(id_value: Any) -> Optional[int]:
        """Sanitize ID values (must be positive integer)"""
        return InputValidator.sanitize_numeric(id_value, min_value=1)
    
    @staticmethod
    def validate_pagination(page: int = 1, limit: int = 10, max_limit: int = 100) -> tuple:
        """Validate pagination parameters"""
        page = max(1, InputValidator.sanitize_numeric(page, min_value=1) or 1)
        limit = min(max_limit, max(1, InputValidator.sanitize_numeric(limit, min_value=1) or 10))
        return page, limit
    
    @staticmethod
    def sanitize_search_query(query: str, max_length: int = 100) -> str:
        """Sanitize search query"""
        if not query:
            return ""
        
        # Remove special characters that could be used for injection
        query = re.sub(r'[^\w\s\-@.]', '', query)
        query = query[:max_length]
        
        return query.strip()
    
    @staticmethod
    def validate_json_structure(data: dict, required_fields: list) -> bool:
        """Validate that JSON has required fields"""
        if not isinstance(data, dict):
            return False
        
        return all(field in data for field in required_fields)
    
    @staticmethod
    def sanitize_file_name(filename: str) -> str:
        """Sanitize file names to prevent path traversal"""
        # Remove path separators and special characters
        filename = re.sub(r'[\\\/\:*?"<>|]', '', filename)
        # Remove leading dots to prevent hidden files
        filename = filename.lstrip('.')
        # Limit length
        filename = filename[:255]
        return filename or "unnamed"

# Global validator instance
validator = InputValidator()

def validate_input(input_data: Any, input_type: str = "string", **kwargs) -> Any:
    """Generic input validation function"""
    if input_data is None:
        return None
    
    if input_type == "string":
        return validator.sanitize_string(input_data, kwargs.get("max_length", 1000))
    elif input_type == "email":
        return input_data if validator.validate_email(input_data) else None
    elif input_type == "phone":
        return input_data if validator.validate_phone(input_data) else None
    elif input_type == "id":
        return validator.sanitize_id(input_data)
    elif input_type == "numeric":
        return validator.sanitize_numeric(
            input_data,
            kwargs.get("min_value"),
            kwargs.get("max_value")
        )
    elif input_type == "search":
        return validator.sanitize_search_query(input_data, kwargs.get("max_length", 100))
    elif input_type == "filename":
        return validator.sanitize_file_name(input_data)
    else:
        return input_data

def check_security(input_string: str) -> dict:
    """Check input for security threats"""
    return {
        "sql_injection": validator.detect_sql_injection(input_string),
        "xss": validator.detect_xss(input_string),
        "sanitized": validator.sanitize_string(input_string)
    }
