"""
Enterprise Database Configuration for Trillions of Records
- Connection pooling with dynamic scaling
- Query optimization with intelligent caching
- Table partitioning by date ranges
- Read replica configuration for horizontal scaling
- Comprehensive indexing strategy
- Redis caching layer integration
"""
from sqlalchemy import create_engine, event, text, Index
from sqlalchemy.orm import sessionmaker, scoped_session
from sqlalchemy.pool import QueuePool
import os
import redis
from redis.backoff import NoBackoff
from redis.retry import Retry
from typing import Optional

# Database Configuration
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///hrms_dev.db')

# Redis Configuration for Caching
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
redis_client = redis.from_url(
    REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=1.0,
    socket_timeout=2.0,
    retry_on_timeout=False,
    retry=Retry(backoff=NoBackoff(), retries=2),
)

# Enterprise Connection Pool Settings - Scaled for Trillions of Records
# SQLite uses a simpler pool, PostgreSQL uses QueuePool
if DATABASE_URL.startswith('sqlite'):
    # SQLite configuration
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False}
    )
else:
    # PostgreSQL configuration with connection pooling
    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=50,              # Increased base connections for high concurrency
        max_overflow=100,          # More overflow connections for traffic spikes
        pool_timeout=30,           # Wait time for available connection
        pool_recycle=3600,       # Recycle connections every hour (increased)
        pool_pre_ping=True,      # Health check before using
        echo=False,
        
        # Performance optimizations
        connect_args={
            'connect_timeout': 10,
            'options': '-c statement_timeout=60000 -c effective_cache_size=1GB -c work_mem=16MB -c maintenance_work_mem=128MB',
        }
    )

# Read Replica Configuration (for read-heavy operations) - Scaled for high read throughput
READ_REPLICA_URL = os.getenv('READ_REPLICA_URL', DATABASE_URL)
if READ_REPLICA_URL.startswith('sqlite'):
    # SQLite read replica (same as primary for local dev)
    read_engine = engine
else:
    # PostgreSQL read replica
    read_engine = create_engine(
        READ_REPLICA_URL,
        poolclass=QueuePool,
        pool_size=30,              # Increased for read scaling
        max_overflow=50,           # More overflow for read spikes
        pool_timeout=30,
        pool_recycle=3600,
        pool_pre_ping=True,
        echo=False,
        connect_args={
            'connect_timeout': 10,
            'options': '-c statement_timeout=60000 -c effective_cache_size=1GB',
        }
    )

# Session Factories
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
ReadSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=read_engine)

# Scoped sessions for thread safety
ScopedSession = scoped_session(SessionLocal)

def get_db():
    """Primary database session for writes"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_read_db():
    """Read replica session for queries"""
    db = ReadSessionLocal()
    try:
        yield db
    finally:
        db.close()

# Performance monitoring - Enhanced for enterprise scale
@event.listens_for(engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Log slow queries with detailed metrics"""
    conn.info.setdefault('query_start_time', [])
    conn.info['query_start_time'].append(__import__('time').time())

@event.listens_for(engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    """Detect and log slow queries for optimization"""
    total = __import__('time').time() - conn.info['query_start_time'].pop(-1)
    if total > 0.5:  # Log queries taking > 500ms (reduced threshold)
        print(f"SLOW QUERY ({total:.3f}s): {statement[:300]}... Parameters: {parameters}")

# Redis Caching Functions
def cache_get(key: str) -> Optional[str]:
    """Get value from Redis cache"""
    try:
        return redis_client.get(key)
    except Exception as e:
        print(f"Redis get error: {e}")
        return None

def cache_set(key: str, value: str, ttl: int = 300):
    """Set value in Redis cache with TTL"""
    try:
        redis_client.setex(key, ttl, value)
    except Exception as e:
        print(f"Redis set error: {e}")

def cache_delete(key: str):
    """Delete key from Redis cache"""
    try:
        redis_client.delete(key)
    except Exception as e:
        print(f"Redis delete error: {e}")

def cache_pattern_delete(pattern: str):
    """Delete all keys matching pattern"""
    try:
        keys = redis_client.keys(pattern)
        if keys:
            redis_client.delete(*keys)
    except Exception as e:
        print(f"Redis pattern delete error: {e}")

# Comprehensive Indexing Strategy
def create_enterprise_indexes():
    """Create optimized indexes for enterprise-scale queries"""
    from models import Employee, Attendance, Payroll, LeaveApplication, Expense
    
    with engine.connect() as conn:
        # Check if using SQLite or PostgreSQL
        is_postgresql = DATABASE_URL.startswith('postgresql')
        
        if is_postgresql:
            # PostgreSQL indexes
            indexes = [
                "CREATE INDEX IF NOT EXISTS idx_employee_org ON employees(organization_id)",
                "CREATE INDEX IF NOT EXISTS idx_employee_status ON employees(status)",
                "CREATE INDEX IF NOT EXISTS idx_employee_dept ON employees(department_id)",
                "CREATE INDEX IF NOT EXISTS idx_employee_code ON employees(employee_code)",
                "CREATE INDEX IF NOT EXISTS idx_employee_email ON employees(email)",
                "CREATE INDEX IF NOT EXISTS idx_employee_name ON employees(first_name, last_name)",
                "CREATE INDEX IF NOT EXISTS idx_employee_composite ON employees(organization_id, status, department_id)",
            ]
            
            # Attendance indexes (critical for time-series data)
            attendance_indexes = [
                "CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)",
                "CREATE INDEX IF NOT EXISTS idx_attendance_emp ON attendance(employee_id)",
                "CREATE INDEX IF NOT EXISTS idx_attendance_org ON attendance(organization_id)",
                "CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status)",
                "CREATE INDEX IF NOT EXISTS idx_attendance_composite ON attendance(date, employee_id, organization_id)",
                "CREATE INDEX IF NOT EXISTS idx_attendance_checkin ON attendance(check_in_time)",
            ]
            
            # Payroll indexes
            payroll_indexes = [
                "CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(period)",
                "CREATE INDEX IF NOT EXISTS idx_payroll_emp ON payroll(employee_id)",
                "CREATE INDEX IF NOT EXISTS idx_payroll_org ON payroll(organization_id)",
                "CREATE INDEX IF NOT EXISTS idx_payroll_status ON payroll(status)",
            ]
            
            # Leave application indexes
            leave_indexes = [
                "CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_applications(employee_id)",
                "CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_applications(status)",
                "CREATE INDEX IF NOT EXISTS idx_leave_dates ON leave_applications(start_date, end_date)",
                "CREATE INDEX IF NOT EXISTS idx_leave_org ON leave_applications(organization_id)",
            ]
            
            # Expense indexes
            expense_indexes = [
                "CREATE INDEX IF NOT EXISTS idx_expense_emp ON expenses(employee_id)",
                "CREATE INDEX IF NOT EXISTS idx_expense_status ON expenses(status)",
                "CREATE INDEX IF NOT EXISTS idx_expense_date ON expenses(date)",
                "CREATE INDEX IF NOT EXISTS idx_expense_org ON expenses(organization_id)",
            ]
            
            all_indexes = indexes + attendance_indexes + payroll_indexes + leave_indexes + expense_indexes
            
            for index_sql in all_indexes:
                try:
                    conn.execute(text(index_sql))
                    print(f"Created index: {index_sql[:60]}...")
                except Exception as e:
                    print(f"Index creation warning: {e}")
            
            conn.commit()
            print("Enterprise indexes created successfully!")
        else:
            # SQLite indexes (simpler syntax)
            print("Creating SQLite indexes...")
            try:
                # Employee indexes
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_employee_org ON employees(organization_id)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_employee_status ON employees(status)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_employee_dept ON employees(department_id)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_employee_code ON employees(employee_code)"))
                
                # Attendance indexes
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendances(date)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_attendance_emp ON attendances(employee_id)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendances(status)"))
                
                # Payroll indexes
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_payroll_emp ON payrolls(employee_id)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_payroll_status ON payrolls(status)"))
                
                # Leave indexes
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_applications(employee_id)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_applications(status)"))
                
                # Expense indexes
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_expense_emp ON expenses(employee_id)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS idx_expense_status ON expenses(status)"))
                
                conn.commit()
                print("SQLite indexes created successfully!")
            except Exception as e:
                print(f"SQLite index creation warning: {e}")

# Database optimization commands
def optimize_database():
    """Run comprehensive database optimization"""
    with engine.connect() as conn:
        is_postgresql = DATABASE_URL.startswith('postgresql')
        
        if is_postgresql:
            # PostgreSQL optimization
            tables = ['employees', 'attendances', 'payrolls', 'leave_applications', 'expenses', 'organizations', 'departments']
            for table in tables:
                try:
                    conn.execute(text(f"ANALYZE {table}"))
                except Exception as e:
                    print(f"Analyze warning for {table}: {e}")
            
            # Update statistics with detailed sampling
            conn.execute(text("VACUUM ANALYZE"))
            
            # Reindex for performance
            for table in tables:
                try:
                    conn.execute(text(f"REINDEX TABLE {table}"))
                except Exception as e:
                    print(f"Reindex warning for {table}: {e}")
            
            conn.commit()
            print("PostgreSQL database optimization completed!")
        else:
            # SQLite optimization
            print("Running SQLite optimization...")
            try:
                conn.execute(text("VACUUM"))
                conn.execute(text("ANALYZE"))
                conn.commit()
                print("SQLite optimization completed!")
            except Exception as e:
                print(f"SQLite optimization warning: {e}")

# Advanced Partitioning Setup for Trillions of Records
def setup_partitioning():
    """Setup table partitioning for massive data scaling"""
    with engine.connect() as conn:
        # Partition attendance by month (most critical for time-series data)
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS attendance_partitioned (
                    LIKE attendance INCLUDING ALL
                ) PARTITION BY RANGE (date);
            """))
            
            # Create partitions for current and future months
            from datetime import datetime, timedelta
            current_date = datetime.now()
            
            for i in range(12):  # Create 12 months of partitions
                start_date = current_date.replace(day=1) + timedelta(days=32*i)
                end_date = (start_date + timedelta(days=32)).replace(day=1)
                
                partition_name = f"attendance_{start_date.strftime('%Y_%m')}"
                conn.execute(text(f"""
                    CREATE TABLE IF NOT EXISTS {partition_name} 
                    PARTITION OF attendance_partitioned
                    FOR VALUES FROM ('{start_date.strftime('%Y-%m-%d')}') TO ('{end_date.strftime('%Y-%m-%d')}');
                """))
            
            print("Attendance partitioning setup completed!")
        except Exception as e:
            print(f"Partitioning setup warning: {e}")
        
        # Partition payroll by quarter
        try:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS payroll_partitioned (
                    LIKE payroll INCLUDING ALL
                ) PARTITION BY RANGE (period);
            """))
            print("Payroll partitioning setup completed!")
        except Exception as e:
            print(f"Payroll partitioning warning: {e}")
        
        conn.commit()

# Query Result Caching Decorator
def cached_query(ttl: int = 300, key_prefix: str = ""):
    """Decorator to cache query results in Redis"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix}:{str(args)}:{str(kwargs)}"
            
            # Try to get from cache
            cached_result = cache_get(cache_key)
            if cached_result:
                import json
                return json.loads(cached_result)
            
            # Execute query
            result = func(*args, **kwargs)
            
            # Cache result
            import json
            cache_set(cache_key, json.dumps(result), ttl)
            
            return result
        return wrapper
    return decorator

# Batch Operations for Performance
def batch_insert(model_class, data_list: list, batch_size: int = 1000):
    """Efficient batch insert for large datasets"""
    from sqlalchemy.orm import Session
    db = SessionLocal()
    try:
        for i in range(0, len(data_list), batch_size):
            batch = data_list[i:i + batch_size]
            db.bulk_insert_mappings(model_class, batch)
            db.commit()
        print(f"Batch inserted {len(data_list)} records")
    except Exception as e:
        db.rollback()
        print(f"Batch insert error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Setting up enterprise database configuration...")
    create_enterprise_indexes()
    optimize_database()
    setup_partitioning()
    print("Enterprise database setup completed!")
