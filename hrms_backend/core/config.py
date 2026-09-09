"""
Enterprise Configuration Settings for HRMS Backend
Supports multiple environments and feature flags
"""
import os
from typing import Optional, List
from pydantic_settings import BaseSettings
from pydantic import field_validator


def _coerce_bool(v: object) -> bool:
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.lower() in ("true", "1", "yes", "on")
    return bool(v)


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "HRMS Enterprise API"
    APP_VERSION: str = "2.0.0"
    APP_ENV: str = os.getenv("APP_ENV", "development")
    DEBUG: bool = False

    @field_validator("DEBUG", mode="before")
    @classmethod
    def _validate_debug(cls, v: object) -> bool:
        return _coerce_bool(v)
    
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    WORKERS: int = int(os.getenv("WORKERS", "4"))
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/hrms_db")
    ASYNC_DATABASE_URL: str = os.getenv("ASYNC_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/hrms_db")
    READ_REPLICA_URL: Optional[str] = os.getenv("READ_REPLICA_URL")
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "50"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "100"))
    DB_POOL_TIMEOUT: int = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    DB_POOL_RECYCLE: int = int(os.getenv("DB_POOL_RECYCLE", "3600"))
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_CLUSTER_URLS: Optional[str] = os.getenv("REDIS_CLUSTER_URLS")
    REDIS_PASSWORD: Optional[str] = os.getenv("REDIS_PASSWORD")
    REDIS_DB: int = int(os.getenv("REDIS_DB", "0"))
    REDIS_MAX_CONNECTIONS: int = int(os.getenv("REDIS_MAX_CONNECTIONS", "50"))
    
    # Cache
    CACHE_TTL: int = int(os.getenv("CACHE_TTL", "300"))
    CACHE_ENABLED: bool = True

    @field_validator("CACHE_ENABLED", mode="before")
    @classmethod
    def _validate_cache_enabled(cls, v: object) -> bool:
        return _coerce_bool(v)
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", os.getenv("JWT_SECRET_KEY", "CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING"))
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", os.getenv("JWT_ACCESS_TOKEN_EXPIRES", "1440")))
    
    # Legacy env variables (for backward compatibility - not used)
    JWT_SECRET_KEY: Optional[str] = None
    JWT_ACCESS_TOKEN_EXPIRES: Optional[str] = None
    
    # Admin Settings
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@hrms.com")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "CHANGE_ME_TO_A_STRONG_PASSWORD")
    SEED_DEFAULT_USERS: bool = False

    @field_validator("SEED_DEFAULT_USERS", mode="before")
    @classmethod
    def _validate_seed_default_users(cls, v: object) -> bool:
        return _coerce_bool(v)
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True

    @field_validator("RATE_LIMIT_ENABLED", mode="before")
    @classmethod
    def _validate_rate_limit(cls, v: object) -> bool:
        return _coerce_bool(v)
    
    RATE_LIMIT_REQUESTS: int = int(os.getenv("RATE_LIMIT_REQUESTS", "1000"))
    RATE_LIMIT_WINDOW: int = int(os.getenv("RATE_LIMIT_WINDOW", "60"))
    
    # CORS — stored as raw string to avoid pydantic-settings json.loads issue
    CORS_ORIGINS: str = "*"
    CORS_ALLOW_CREDENTIALS: bool = True

    @field_validator("CORS_ALLOW_CREDENTIALS", mode="before")
    @classmethod
    def _validate_cors(cls, v: object) -> bool:
        return _coerce_bool(v)
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = os.getenv("LOG_FORMAT", "json")
    
    # Feature Flags
    ENABLE_ASYNC_ENDPOINTS: bool = False

    @field_validator("ENABLE_ASYNC_ENDPOINTS", mode="before")
    @classmethod
    def _validate_async(cls, v: object) -> bool:
        return _coerce_bool(v)
    
    ENABLE_CIRCUIT_BREAKER: bool = True

    @field_validator("ENABLE_CIRCUIT_BREAKER", mode="before")
    @classmethod
    def _validate_circuit_breaker(cls, v: object) -> bool:
        return _coerce_bool(v)
    
    ENABLE_DISTRIBUTED_TRACING: bool = False

    @field_validator("ENABLE_DISTRIBUTED_TRACING", mode="before")
    @classmethod
    def _validate_tracing(cls, v: object) -> bool:
        return _coerce_bool(v)
    
    # Monitoring
    ENABLE_METRICS: bool = True

    @field_validator("ENABLE_METRICS", mode="before")
    @classmethod
    def _validate_metrics(cls, v: object) -> bool:
        return _coerce_bool(v)
    
    PROMETHEUS_PORT: int = int(os.getenv("PROMETHEUS_PORT", "9090"))
    
    # Message Queue
    ENABLE_MESSAGE_QUEUE: bool = False

    @field_validator("ENABLE_MESSAGE_QUEUE", mode="before")
    @classmethod
    def _validate_mq(cls, v: object) -> bool:
        return _coerce_bool(v)
    
    RABBITMQ_URL: Optional[str] = os.getenv("RABBITMQ_URL", "amqp://localhost:5672")
    
    # Storage
    AWS_S3_BUCKET: Optional[str] = os.getenv("AWS_S3_BUCKET")
    AWS_ACCESS_KEY_ID: Optional[str] = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: Optional[str] = os.getenv("AWS_SECRET_ACCESS_KEY")
    AWS_REGION: str = os.getenv("AWS_REGION", "us-east-1")
    # Selfie: SELFIE_MAX_SIDE, SELFIE_JPEG_QUALITY, SELFIE_RETENTION_DAYS, S3_PUBLIC_URL_PREFIX
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # Allow extra fields from .env file

settings = Settings()

def get_settings() -> Settings:
    return settings
