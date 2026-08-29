"""
Async Database Configuration for High-Concurrency Enterprise Applications
- Async SQLAlchemy for non-blocking database operations
- Connection pooling optimized for async operations
- Supports async/await patterns for better performance
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

# Async Database URL (use asyncpg for PostgreSQL)
ASYNC_DATABASE_URL = os.getenv(
    'ASYNC_DATABASE_URL', 
    'postgresql+asyncpg://postgres:123456@localhost:5432/hrms_dev'
)

# Create async engine with optimized pool settings
async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=50,              # Base connections for async operations
    max_overflow=100,          # Extra connections for traffic spikes
    pool_timeout=30,           # Wait time for available connection
    pool_recycle=3600,       # Recycle connections every hour
    pool_pre_ping=True,      # Health check before using
    echo=False,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Base class for async models
AsyncBase = declarative_base()

# Dependency to get async database session
async def get_async_db():
    """Async database session for non-blocking operations"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# Async read replica session
async def get_async_read_db():
    """Async read replica session for queries"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

# Example async query helper functions
async def async_execute_query(session, query):
    """Execute a query asynchronously"""
    result = await session.execute(query)
    return result.scalars().all()

async def async_execute_count(session, query):
    """Execute a count query asynchronously"""
    result = await session.execute(query)
    return result.scalar()

async def async_execute_single(session, query):
    """Execute a query and return single result asynchronously"""
    result = await session.execute(query)
    return result.scalar_one_or_none()

if __name__ == "__main__":
    print("Async database configuration loaded successfully!")
