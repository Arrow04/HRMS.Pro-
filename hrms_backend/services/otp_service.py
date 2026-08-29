import random
import string
from datetime import datetime, timedelta
from typing import Optional
import secrets


class OTPService:
    """Service for generating and verifying OTPs"""
    
    @staticmethod
    def generate_otp(length: int = 6) -> str:
        """Generate a random numeric OTP"""
        return ''.join(random.choices(string.digits, k=length))
    
    @staticmethod
    def generate_token(length: int = 32) -> str:
        """Generate a secure random token for email verification"""
        return secrets.token_urlsafe(length)
    
    @staticmethod
    def get_otp_expiry(minutes: int = 10) -> datetime:
        """Get OTP expiry time (default 10 minutes)"""
        return datetime.utcnow() + timedelta(minutes=minutes)
    
    @staticmethod
    def is_otp_valid(otp_expiry: Optional[datetime]) -> bool:
        """Check if OTP is still valid"""
        if not otp_expiry:
            return False
        return datetime.utcnow() < otp_expiry
    
    @staticmethod
    def mask_phone(phone: str) -> str:
        """Mask phone number for display (e.g., +91******1234)"""
        if not phone or len(phone) < 4:
            return phone
        return phone[:4] + '******' + phone[-4:]
    
    @staticmethod
    def mask_email(email: str) -> str:
        """Mask email for display (e.g., j***@example.com)"""
        if not email or '@' not in email:
            return email
        local, domain = email.split('@', 1)
        masked_local = local[0] + '***' + local[-1] if len(local) > 2 else '***'
        return f"{masked_local}@{domain}"
