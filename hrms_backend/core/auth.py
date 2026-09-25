import os
import logging
from datetime import datetime, timedelta
from typing import List, Optional

import bcrypt as _bcrypt

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from contextvars import ContextVar

logger = logging.getLogger(__name__)

request_context = ContextVar("request_context", default={})

from database import get_db
from models import User
from core.context import current_user_ctx, request_ctx as _core_request_ctx

APP_ENV = os.getenv("APP_ENV", "development")
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

if APP_ENV == "production" and (not SECRET_KEY or SECRET_KEY in ("your-secret-key-change-in-production", "hrms_dev_secret_key_change_in_prod", "")):
    raise RuntimeError(
        "JWT_SECRET_KEY must be set to a strong, unique value in production. "
        "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
    )

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
        try:
            return _bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception as e:
            logger.error(f"bcrypt verification error: {e}")
            return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def check_role(allowed_roles: List[str]):
    async def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role}' does not have permission to access this resource",
            )
        return current_user
    return role_checker

async def get_current_user(request: Request, token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise credentials_exception

    # Session invalidation: if the password was changed, all tokens issued
    # before the bump carry an older token_version and must be rejected.
    token_version = payload.get("tv", 0)
    if token_version != (user.token_version or 0):
        raise credentials_exception

    # Tenant isolation: a non-superadmin session must belong to an org —
    # a NULL-org account would otherwise bypass every org-scoped filter.
    if user.role != "superadmin" and user.organization_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not linked to an organization",
        )

    client_host = request.client.host if request.client else "Unknown"
    user_agent = request.headers.get("user-agent", "Unknown")

    path = request.url.path
    module = "System"
    if "/api/employees" in path: module = "Employee"
    elif "/api/companies" in path or "/api/organizations" in path: module = "Company"
    elif "/api/master-data" in path or "/api/lookup" in path: module = "MasterData"
    elif "/api/settings" in path: module = "Settings"
    elif "/api/leaves" in path: module = "Leave"
    elif "/api/attendance" in path: module = "Attendance"
    elif "/api/expenses" in path: module = "Expenses"
    elif "/api/payroll" in path: module = "Payroll"
    elif "/api/recruitment" in path: module = "Recruitment"
    elif "/api/reports" in path: module = "Reports"

    request_context.set({
        "user_id": user.id,
        "user_name": user.full_name,
        "ip_address": client_host,
        "user_agent": user_agent,
        "module": module
    })

    current_user_ctx.set(user)

    return user

require_superadmin = check_role(['superadmin'])
