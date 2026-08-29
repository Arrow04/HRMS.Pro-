"""
Database Sharding Strategy for Enterprise Scale
Enables horizontal scaling by distributing data across multiple database instances
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
import hashlib
from typing import Optional
from contextlib import contextmanager

class DatabaseShard:
    """Represents a single database shard"""
    
    def __init__(self, shard_id: int, database_url: str):
        self.shard_id = shard_id
        self.database_url = database_url
        self.engine = create_engine(
            database_url,
            pool_size=20,
            max_overflow=40,
            pool_timeout=30,
            pool_recycle=3600,
            pool_pre_ping=True
        )
        self.SessionLocal = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
    
    def get_session(self):
        """Get a database session for this shard"""
        return self.SessionLocal()
    
    def health_check(self) -> bool:
        """Check if this shard is healthy"""
        try:
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return True
        except Exception:
            return False

class ShardingStrategy:
    """Database sharding strategy for horizontal scaling"""
    
    def __init__(self, shard_configs: list):
        """
        Initialize sharding strategy with multiple database shards
        
        Args:
            shard_configs: List of (shard_id, database_url) tuples
        """
        self.shards = {}
        for shard_id, database_url in shard_configs:
            self.shards[shard_id] = DatabaseShard(shard_id, database_url)
        
        self.num_shards = len(self.shards)
        self.default_shard = 0
    
    def get_shard_for_employee(self, employee_id: int) -> DatabaseShard:
        """
        Determine which shard should contain an employee's data
        Uses consistent hashing to ensure the same employee always goes to the same shard
        
        Args:
            employee_id: The employee ID to shard by
            
        Returns:
            DatabaseShard: The appropriate shard
        """
        if self.num_shards == 1:
            return self.shards[self.default_shard]
        
        # Consistent hashing using employee_id
        shard_index = int(hashlib.md5(str(employee_id).encode()).hexdigest(), 16) % self.num_shards
        return self.shards[shard_index]
    
    def get_shard_for_organization(self, organization_id: int) -> DatabaseShard:
        """
        Determine which shard should contain an organization's data
        
        Args:
            organization_id: The organization ID to shard by
            
        Returns:
            DatabaseShard: The appropriate shard
        """
        if self.num_shards == 1:
            return self.shards[self.default_shard]
        
        shard_index = int(hashlib.md5(str(organization_id).encode()).hexdigest(), 16) % self.num_shards
        return self.shards[shard_index]
    
    def get_shard_for_date(self, date_str: str) -> DatabaseShard:
        """
        Determine which shard should contain time-series data for a specific date
        Useful for attendance, payroll, etc.
        
        Args:
            date_str: Date string in YYYY-MM-DD format
            
        Returns:
            DatabaseShard: The appropriate shard
        """
        if self.num_shards == 1:
            return self.shards[self.default_shard]
        
        # Shard by month to keep related data together
        month = int(date_str[5:7])  # Extract month
        shard_index = month % self.num_shards
        return self.shards[shard_index]
    
    @contextmanager
    def get_session_for_employee(self, employee_id: int):
        """
        Context manager to get a session for a specific employee's shard
        
        Args:
            employee_id: The employee ID
            
        Yields:
            Session: Database session for the appropriate shard
        """
        shard = self.get_shard_for_employee(employee_id)
        session = shard.get_session()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
    
    @contextmanager
    def get_session_for_organization(self, organization_id: int):
        """
        Context manager to get a session for a specific organization's shard
        
        Args:
            organization_id: The organization ID
            
        Yields:
            Session: Database session for the appropriate shard
        """
        shard = self.get_shard_for_organization(organization_id)
        session = shard.get_session()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
    
    def get_all_shard_sessions(self):
        """
        Get sessions for all shards (for cross-shard queries)
        
        Yields:
            List of sessions for all shards
        """
        sessions = []
        try:
            for shard in self.shards.values():
                session = shard.get_session()
                sessions.append(session)
            yield sessions
        finally:
            for session in sessions:
                session.close()
    
    def health_check_all(self) -> dict:
        """
        Check health of all shards
        
        Returns:
            dict: Health status of each shard
        """
        health_status = {}
        for shard_id, shard in self.shards.items():
            health_status[shard_id] = shard.health_check()
        return health_status
    
    def get_shard_stats(self) -> dict:
        """
        Get statistics for all shards
        
        Returns:
            dict: Statistics for each shard
        """
        stats = {}
        for shard_id, shard in self.shards.items():
            try:
                with shard.get_session() as session:
                    # Get employee count
                    result = session.execute(text("SELECT COUNT(*) FROM employees"))
                    employee_count = result.scalar()
                    
                    # Get database size
                    result = session.execute(text("SELECT pg_database_size(current_database())"))
                    db_size = result.scalar()
                    
                    stats[shard_id] = {
                        "healthy": True,
                        "employee_count": employee_count,
                        "database_size_bytes": db_size,
                        "database_size_mb": round(db_size / 1024 / 1024, 2)
                    }
            except Exception as e:
                stats[shard_id] = {
                    "healthy": False,
                    "error": str(e)
                }
        
        return stats

# Initialize sharding strategy from environment variables
def initialize_sharding():
    """
    Initialize database sharding from environment configuration
    
    Environment variables:
        SHARD_ENABLED: Whether sharding is enabled (default: false)
        SHARD_COUNT: Number of shards (default: 1)
        SHARD_0_URL: Database URL for shard 0
        SHARD_1_URL: Database URL for shard 1
        ...
    """
    sharding_enabled = os.getenv("SHARD_ENABLED", "false").lower() == "true"
    
    if not sharding_enabled:
        # Single shard configuration
        database_url = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/hrms_db")
        return ShardingStrategy([(0, database_url)])
    
    # Multi-shard configuration
    shard_count = int(os.getenv("SHARD_COUNT", "1"))
    shard_configs = []
    
    for i in range(shard_count):
        shard_url = os.getenv(f"SHARD_{i}_URL")
        if shard_url:
            shard_configs.append((i, shard_url))
    
    if not shard_configs:
        # Fallback to single shard
        database_url = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/hrms_db")
        return ShardingStrategy([(0, database_url)])
    
    return ShardingStrategy(shard_configs)

# Global sharding instance
sharding_strategy = initialize_sharding()
