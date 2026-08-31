from sqlalchemy import create_engine, text, inspect
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

APP_ENV = os.getenv("APP_ENV", "development").lower()
ALLOW_SQLITE_FALLBACK = os.getenv("ALLOW_SQLITE_FALLBACK", "true").lower() == "true"
SEED_DEFAULT_USERS = os.getenv("SEED_DEFAULT_USERS", "false").lower() == "true"
RUN_SCHEMA_SYNC = os.getenv("RUN_SCHEMA_SYNC", "true").lower() == "true"

DB_POOL_RECYCLE = int(os.getenv('DB_POOL_RECYCLE', '3600'))
PG_STATEMENT_TIMEOUT_MS = int(os.getenv('PG_STATEMENT_TIMEOUT_MS', '30000'))
PG_APP_NAME = os.getenv('PG_APP_NAME', 'hrms_api')

# Database configuration (PostgreSQL)
# Default to local postgres if env var not set
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://hrms_user:hrms_password@localhost:5433/hrms_db')


def _normalize_database_url(url: str) -> str:
    """Support Supabase/Railway postgres:// URLs and require SSL for hosted Postgres."""
    normalized = (url or '').strip()
    if normalized.startswith('postgres://'):
        normalized = 'postgresql+psycopg2://' + normalized[len('postgres://'):]
    elif normalized.startswith('postgresql://') and not normalized.startswith('postgresql+'):
        normalized = normalized.replace('postgresql://', 'postgresql+psycopg2://', 1)
    if normalized and 'sslmode=' not in normalized and any(
        host in normalized for host in ('supabase.com', 'supabase.co', 'render.com')
    ):
        normalized += '&sslmode=require' if '?' in normalized else '?sslmode=require'
    return normalized


# Create engine
original_db_url = _normalize_database_url(DATABASE_URL)
DATABASE_URL = original_db_url
try:
    if original_db_url.startswith('sqlite:///'):
        engine = create_engine(original_db_url, connect_args={"check_same_thread": False})
    elif original_db_url.startswith('postgresql'):
        DATABASE_URL = original_db_url
        if original_db_url.startswith('postgresql://'):
            DATABASE_URL = original_db_url.replace('postgresql://', 'postgresql+psycopg2://', 1)
        # Per-process pool settings. With multiple uvicorn workers, the aggregate
        # connection count is workers * pool_size, so keep the per-worker pool
        # modest (default 5 + 10 overflow) to stay well under PG's max_connections.
        DB_POOL_SIZE = int(os.getenv('DB_POOL_SIZE', '5'))
        DB_MAX_OVERFLOW = int(os.getenv('DB_MAX_OVERFLOW', '10'))
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_size=DB_POOL_SIZE,
            max_overflow=DB_MAX_OVERFLOW,
            pool_recycle=DB_POOL_RECYCLE,
            pool_timeout=15,
            connect_args={
                "options": (
                    f"-c statement_timeout={PG_STATEMENT_TIMEOUT_MS} "
                    f"-c application_name={PG_APP_NAME}"
                ),
            },
        )
    else:
        engine = create_engine(original_db_url)
    
    # quick connection test
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
except Exception as e:
    if ALLOW_SQLITE_FALLBACK and APP_ENV != "production":
        print(f"Warning: could not connect using DATABASE_URL ({e}). Falling back to SQLite 'hrms_dev.db'.")
        sqlite_path = os.path.join(os.path.dirname(__file__), 'hrms_dev.db')
        engine = create_engine(f"sqlite:///{sqlite_path}", connect_args={"check_same_thread": False})
    else:
        raise RuntimeError(f"Database connection failed and SQLite fallback is disabled: {e}") from e

# Create session local class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ---- Read replica support ----
# When READ_REPLICA_URL is configured (e.g. docker-compose.prod.yml), read-only
# endpoints can route through read_engine. Otherwise it safely aliases the primary
# engine so get_read_db() works everywhere.
READ_REPLICA_URL = os.getenv('READ_REPLICA_URL', '').strip()
if READ_REPLICA_URL:
    _replica_url = READ_REPLICA_URL
    if _replica_url.startswith('postgresql://') and not _replica_url.startswith('postgresql+'):
        _replica_url = _replica_url.replace('postgresql://', 'postgresql+psycopg2://', 1)
    try:
        read_engine = create_engine(
            _replica_url,
            pool_pre_ping=True,
            pool_size=int(os.getenv('DB_READ_POOL_SIZE', '10')),
            max_overflow=int(os.getenv('DB_READ_MAX_OVERFLOW', '20')),
            pool_recycle=DB_POOL_RECYCLE,
            pool_timeout=30,
            connect_args={
                "options": (
                    f"-c statement_timeout={PG_STATEMENT_TIMEOUT_MS} "
                    f"-c application_name={PG_APP_NAME}_read"
                ),
            },
        )
    except Exception as e:
        print(f"Warning: read replica configured but could not connect ({e}). Using primary for reads.")
        read_engine = engine
else:
    read_engine = engine

ReadSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=read_engine)

# Create base class for models
Base = declarative_base()

# Lazy import to avoid circular dependency with models → core.audit → models
try:
    from core.audit import setup_auditing
    setup_auditing()
except ImportError:
    pass  # Will be set up on first init_db call

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_read_db():
    """Read replica session for read-heavy queries. Falls back to primary when no replica is configured."""
    db = ReadSessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize the database with optional runtime schema sync and seed data."""
    # Import models to ensure they are registered with SQLAlchemy
    from models import (
        User, Employee, Organization, Department, LeaveBalance,
        LeaveApplication, Attendance, Expense, Payroll, Holiday,
        AuditLog, Notification, Branch, Designation, LeaveType,
        SalaryTemplate, Shift, DutyRoster, JobOpening, Candidate,
        Interview, StatutorySetting, PayrollTemplate
    )

    if RUN_SCHEMA_SYNC:
        if APP_ENV == "production":
            print("RUN_SCHEMA_SYNC: applying schema in production.")
        else:
            print("RUN_SCHEMA_SYNC: applying schema in development.")

        Base.metadata.create_all(bind=engine)

        # Create enterprise composite indexes (idempotent) for tenant-scoped
        # and time-series queries at 10M-employee scale.
        try:
            from core.index_sync import sync_enterprise_indexes
            sync_enterprise_indexes(engine)
        except Exception as e:
            print(f"Enterprise index sync warning: {e}")

        if APP_ENV != "production":
            inspector = inspect(engine)

            users_columns = [col['name'] for col in inspector.get_columns('users')]
            if 'organization_id' not in users_columns:
                with engine.connect() as conn:
                    conn.execute(text('ALTER TABLE users ADD COLUMN organization_id INTEGER REFERENCES organizations(id)'))
                    conn.commit()

            if 'theme_settings' not in users_columns:
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE users ADD COLUMN theme_settings TEXT DEFAULT '{\"fontFamily\": \"Inter\"}'"))
                    conn.commit()

            # DB-level duplicate-payroll guard: one live payroll per employee/period.
            # Partial index so soft-deleted records don't block re-generation.
            try:
                payrolls_columns = [col['name'] for col in inspector.get_columns('payrolls')]
                if payrolls_columns and 'employee_id' in payrolls_columns and 'month' in payrolls_columns and 'year' in payrolls_columns:
                    with engine.connect() as conn:
                        conn.execute(text(
                            "CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_emp_period_live "
                            "ON payrolls (employee_id, month, year) WHERE deleted_at IS NULL"
                        ))
                        conn.commit()
            except Exception as e:
                print(f"Payroll unique index sync warning: {e}")

            # Jurisdiction snapshot columns for payrolls (country/state in force).
            try:
                if 'country' not in payrolls_columns:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE payrolls ADD COLUMN country VARCHAR(50)"))
                        conn.commit()
                payrolls_columns2 = [col['name'] for col in inspector.get_columns('payrolls')]
                if 'registered_state' not in payrolls_columns2:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE payrolls ADD COLUMN registered_state VARCHAR(100)"))
                        conn.commit()
            except Exception as e:
                print(f"Payroll jurisdiction column sync warning: {e}")

            # Exit-record F&F settlement snapshot columns.
            try:
                exit_cols = [col['name'] for col in inspector.get_columns('exit_records')]
                if exit_cols and 'fnf_amount' not in exit_cols:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE exit_records ADD COLUMN fnf_amount FLOAT"))
                        conn.commit()
                exit_cols2 = [col['name'] for col in inspector.get_columns('exit_records')]
                if exit_cols2 and 'fnf_details' not in exit_cols2:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE exit_records ADD COLUMN fnf_details JSON"))
                        conn.commit()
            except Exception as e:
                print(f"ExitRecord FnF column sync warning: {e}")

            # Organization TAN column (used for Form 16 Part A).
            try:
                org_cols = [col['name'] for col in inspector.get_columns('organizations')]
                if org_cols and 'tan_no' not in org_cols:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE organizations ADD COLUMN tan_no VARCHAR(50)"))
                        conn.commit()
            except Exception as e:
                print(f"Organization TAN column sync warning: {e}")

            # Company TAN/PAN/GST columns (each legal entity has its own for Form 16).
            try:
                company_cols = [col['name'] for col in inspector.get_columns('companies')]
                if company_cols:
                    for col_name in ("pan_no", "tan_no", "gst_no", "cin"):
                        if col_name not in company_cols:
                            with engine.connect() as conn:
                                conn.execute(text(f"ALTER TABLE companies ADD COLUMN {col_name} VARCHAR(50)"))
                                conn.commit()
            except Exception as e:
                print(f"Company TAN/PAN/GST column sync warning: {e}")

            # Employee payroll template column (company-wise payroll template picker).
            try:
                emp_cols3 = [col['name'] for col in inspector.get_columns('employees')]
                if 'payroll_template_id' not in emp_cols3:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE employees ADD COLUMN payroll_template_id INTEGER REFERENCES payroll_templates(id)"))
                        conn.commit()
            except Exception as e:
                print(f"Employee payroll template column sync warning: {e}")

            # Payroll template pay-run metadata columns (cycle/day/auto-email).
            try:
                tpl_cols = [col['name'] for col in inspector.get_columns('payroll_templates')]
                if tpl_cols:
                    for col_def in (
                        "pay_cycle VARCHAR(20) DEFAULT 'monthly'",
                        "pay_day INTEGER",
                        "auto_payslip BOOLEAN DEFAULT FALSE",
                        "email_payslip BOOLEAN DEFAULT FALSE",
                    ):
                        col_name = col_def.split()[0]
                        if col_name not in tpl_cols:
                            with engine.connect() as conn:
                                conn.execute(text(f"ALTER TABLE payroll_templates ADD COLUMN {col_def}"))
                                conn.commit()
            except Exception as e:
                print(f"Payroll template pay-run column sync warning: {e}")

            # Payroll components Form 16 tax head (Part B categorization).
            try:
                pc_cols = [col['name'] for col in inspector.get_columns('payroll_components')]
                if pc_cols and 'tax_category' not in pc_cols:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE payroll_components ADD COLUMN tax_category VARCHAR(50)"))
                        conn.commit()
            except Exception as e:
                print(f"Payroll component tax_category column sync warning: {e}")

            # EPF employer outflows (EDLI insurance + admin charges) — statutory settings.
            try:
                stat_cols = [col['name'] for col in inspector.get_columns('statutory_settings')]
                if stat_cols:
                    for col_def in (
                        "pf_edli_rate FLOAT DEFAULT 0.5",
                        "pf_edli_max_monthly FLOAT DEFAULT 75.0",
                        "pf_admin_rate FLOAT DEFAULT 0.5",
                        "pf_admin_min_monthly FLOAT DEFAULT 75.0",
                        "pf_wage_ceiling FLOAT DEFAULT 15000.0",
                        "eps_wage_ceiling FLOAT DEFAULT 15000.0",
                        "esi_disabled_ceiling FLOAT DEFAULT 25000.0",
                        "gratuity_eligible_years FLOAT DEFAULT 5.0",
                        "gratuity_days_per_year FLOAT DEFAULT 15.0",
                        "gratuity_tax_exempt_ceiling FLOAT DEFAULT 2000000.0",
                        "bonus_applicable BOOLEAN DEFAULT FALSE",
                        "bonus_min_rate FLOAT DEFAULT 8.33",
                        "bonus_max_rate FLOAT DEFAULT 20.0",
                        "bonus_wage_ceiling FLOAT DEFAULT 21000.0",
                    ):
                        col_name = col_def.split()[0]
                        if col_name not in stat_cols:
                            with engine.connect() as conn:
                                conn.execute(text(f"ALTER TABLE statutory_settings ADD COLUMN {col_def}"))
                                conn.commit()
            except Exception as e:
                print(f"Statutory EDLI/admin column sync warning: {e}")

            # Payroll EDLI + admin charge columns (employer contribution snapshot).
            try:
                pay_cols = [col['name'] for col in inspector.get_columns('payrolls')]
                if pay_cols:
                    for col_def in (
                        "pf_edli_contribution FLOAT DEFAULT 0",
                        "pf_admin_contribution FLOAT DEFAULT 0",
                    ):
                        col_name = col_def.split()[0]
                        if col_name not in pay_cols:
                            with engine.connect() as conn:
                                conn.execute(text(f"ALTER TABLE payrolls ADD COLUMN {col_def}"))
                                conn.commit()
            except Exception as e:
                print(f"Payroll EDLI/admin column sync warning: {e}")

            # Payroll attendance breakdown columns (half-day / holiday / week-off).
            try:
                pay_cols2 = [col['name'] for col in inspector.get_columns('payrolls')]
                if pay_cols2:
                    for col_def in (
                        "half_days INTEGER DEFAULT 0",
                        "holiday_days INTEGER DEFAULT 0",
                        "week_off_days INTEGER DEFAULT 0",
                    ):
                        col_name = col_def.split()[0]
                        if col_name not in pay_cols2:
                            with engine.connect() as conn:
                                conn.execute(text(f"ALTER TABLE payrolls ADD COLUMN {col_def}"))
                                conn.commit()
            except Exception as e:
                print(f"Payroll attendance breakdown column sync warning: {e}")

            # PayrollRun department scoping column (Run Payroll department filter).
            try:
                prun_cols = [col['name'] for col in inspector.get_columns('payroll_runs')]
                if prun_cols and 'department_id' not in prun_cols:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE payroll_runs ADD COLUMN department_id INTEGER"))
                        conn.commit()
            except Exception as e:
                print(f"PayrollRun department_id column sync warning: {e}")

            # PayrollRun lifecycle counters (approved / rerun) for Run History.
            try:
                prun_cols2 = [col['name'] for col in inspector.get_columns('payroll_runs')]
                if prun_cols2:
                    for col_def in ("approved INTEGER DEFAULT 0", "rerun INTEGER DEFAULT 0"):
                        col_name = col_def.split()[0]
                        if col_name not in prun_cols2:
                            with engine.connect() as conn:
                                conn.execute(text(f"ALTER TABLE payroll_runs ADD COLUMN {col_def}"))
                                conn.commit()
            except Exception as e:
                print(f"PayrollRun lifecycle counter column sync warning: {e}")

            # PayrollRun action-user tracking (who submitted/approved/re-ran).
            try:
                prun_cols3 = [col['name'] for col in inspector.get_columns('payroll_runs')]
                if prun_cols3:
                    for col_def in (
                        "submitted_by INTEGER",
                        "submitted_at TIMESTAMP",
                        "approved_by INTEGER",
                        "approved_at TIMESTAMP",
                        "rerun_by INTEGER",
                        "rerun_at TIMESTAMP",
                    ):
                        col_name = col_def.split()[0]
                        if col_name not in prun_cols3:
                            with engine.connect() as conn:
                                conn.execute(text(f"ALTER TABLE payroll_runs ADD COLUMN {col_def}"))
                                conn.commit()
            except Exception as e:
                print(f"PayrollRun action-user column sync warning: {e}")

            # Leave type payroll flags (paid / encashable / color) + company scoping.
            try:
                lt_cols = [col['name'] for col in inspector.get_columns('leave_types')]
                if lt_cols:
                    for col_def in (
                        "is_paid BOOLEAN DEFAULT TRUE",
                        "is_encashable BOOLEAN DEFAULT FALSE",
                        "color VARCHAR(20) DEFAULT '#1C64F2'",
                        "company_id INTEGER REFERENCES companies(id)",
                    ):
                        col_name = col_def.split()[0]
                        if col_name not in lt_cols:
                            with engine.connect() as conn:
                                conn.execute(text(f"ALTER TABLE leave_types ADD COLUMN {col_def}"))
                                conn.commit()
            except Exception as e:
                print(f"Leave type payroll flag sync warning: {e}")

            # Attendance policy company scoping.
            try:
                ap_cols = [col['name'] for col in inspector.get_columns('attendance_policies')]
                if ap_cols and 'company_id' not in ap_cols:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE attendance_policies ADD COLUMN company_id INTEGER REFERENCES companies(id)"))
                        conn.commit()
            except Exception as e:
                print(f"Attendance policy company_id sync warning: {e}")

            # Payroll period lock employee scoping.
            try:
                ppl_cols = [col['name'] for col in inspector.get_columns('payroll_period_locks')]
                if ppl_cols and 'employee_id' not in ppl_cols:
                    with engine.connect() as conn:
                        conn.execute(text("ALTER TABLE payroll_period_locks ADD COLUMN employee_id INTEGER REFERENCES employees(id)"))
                        conn.commit()
            except Exception as e:
                print(f"Payroll period lock employee_id sync warning: {e}")

            # State PT/LWF effective-dated tables (seed once from static defaults).
            try:
                from models import StatePTSlab, StateLWFConfig
                from data.state_compliance import PROFESSIONAL_TAX, LWF as STATIC_LWF
                from datetime import date as _date
                with SessionLocal() as seed_db:
                    if seed_db.query(StatePTSlab).count() == 0:
                        for code, cfg in PROFESSIONAL_TAX.items():
                            for slab in cfg.get("slabs", []):
                                seed_db.add(StatePTSlab(
                                    state_code=code,
                                    state_name=cfg.get("state_name", ""),
                                    from_gross=float(slab.get("from_gross", 0) or 0),
                                    to_gross=float(slab["to_gross"]) if slab.get("to_gross") is not None else None,
                                    amount=float(slab.get("amount", 0) or 0),
                                    description=slab.get("description", ""),
                                    annual_max=float(cfg["annual_max"]) if cfg.get("annual_max") is not None else None,
                                    effective_from=_date(2000, 1, 1),
                                    effective_to=None,
                                    source="system",
                                ))
                        seed_db.commit()
                        print("Seeded state_pt_slabs")
                    if seed_db.query(StateLWFConfig).count() == 0:
                        for code, cfg in STATIC_LWF.items():
                            seed_db.add(StateLWFConfig(
                                state_code=code,
                                state_name=cfg.get("state_name", ""),
                                applicable=bool(cfg.get("applicable", False)),
                                employee_contribution=float(cfg.get("employee_contribution", 0) or 0),
                                employer_contribution=float(cfg.get("employer_contribution", 0) or 0),
                                frequency=cfg.get("frequency", "monthly"),
                                max_wage_for_applicability=float(cfg["max_wage_for_applicability"]) if cfg.get("max_wage_for_applicability") is not None else None,
                                effective_from=_date(2000, 1, 1),
                                effective_to=None,
                                source="system",
                            ))
                        seed_db.commit()
                        print("Seeded state_lwf_configs")
            except Exception as e:
                print(f"State statutory slab seed warning: {e}")

            if 'deleted_at' not in users_columns:
                with engine.connect() as conn:
                    conn.execute(text('ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP'))
                    conn.commit()

            emp_columns = [col['name'] for col in inspector.get_columns('employees')]
            missing_emp_cols = [
                ('voter_id', 'VARCHAR(100)'),
                ('aadhar_number', 'VARCHAR(100)'),
                ('pan_number', 'VARCHAR(100)'),
                ('driving_license', 'VARCHAR(100)'),
                ('passport_number', 'VARCHAR(100)'),
                ('birth_certificate_number', 'VARCHAR(100)'),
                ('designation_id', 'INTEGER REFERENCES designations(id)'),
                ('landmark', 'VARCHAR(255)'),
                ('permanent_landmark', 'VARCHAR(255)'),
                ('current_state', 'VARCHAR(100)'),
                ('current_pincode', 'VARCHAR(10)'),
                ('permanent_state', 'VARCHAR(100)'),
                ('permanent_pincode', 'VARCHAR(10)'),
                ('account_holder_name', 'VARCHAR(255)'),
                ('full_name', 'VARCHAR(255)'),
            ]
            with engine.connect() as conn:
                for col_name, col_type in missing_emp_cols:
                    if col_name not in emp_columns:
                        try:
                            conn.execute(text(f'ALTER TABLE employees ADD COLUMN {col_name} {col_type}'))
                            print(f'Added column: {col_name} to employees')
                        except Exception:
                            pass
                try:
                    conn.execute(text("""
                        UPDATE employees
                        SET full_name = TRIM(
                            COALESCE(first_name, '') ||
                            CASE
                                WHEN last_name IS NOT NULL AND TRIM(last_name) <> '' THEN ' ' || last_name
                                ELSE ''
                            END
                        )
                        WHERE full_name IS NULL OR TRIM(full_name) = ''
                    """))
                except Exception:
                    pass
                conn.commit()

            try:
                inspector = inspect(engine)
                emp_columns2 = [col['name'] for col in inspector.get_columns('employees')]
                if 'bank_accounts' not in emp_columns2:
                    with engine.connect() as conn:
                        conn.execute(text('ALTER TABLE employees ADD COLUMN bank_accounts JSON'))
                        conn.commit()
                for col_name in ('experience_details', 'achievements_details', 'activities_details', 'skills_list', 'id_documents'):
                    if col_name not in emp_columns2:
                        with engine.connect() as conn:
                            conn.execute(text(f'ALTER TABLE employees ADD COLUMN {col_name} JSON'))
                            conn.commit()
            except Exception:
                pass

            try:
                inspector = inspect(engine)
                company_columns = [col['name'] for col in inspector.get_columns('companies')]
                for col_name, col_type in [('state', 'VARCHAR(100)'), ('pincode', 'VARCHAR(10)')]:
                    if col_name not in company_columns:
                        with engine.connect() as conn:
                            conn.execute(text(f'ALTER TABLE companies ADD COLUMN {col_name} {col_type}'))
                            conn.commit()
                branch_columns = [col['name'] for col in inspector.get_columns('branches')]
                for col_name, col_type in [('state', 'VARCHAR(100)'), ('pincode', 'VARCHAR(10)')]:
                    if col_name not in branch_columns:
                        with engine.connect() as conn:
                            conn.execute(text(f'ALTER TABLE branches ADD COLUMN {col_name} {col_type}'))
                            conn.commit()
            except Exception:
                pass

            try:
                inspector = inspect(engine)
                exit_columns = [col['name'] for col in inspector.get_columns('exit_records')]
                if 'archived_at' not in exit_columns:
                    with engine.connect() as conn:
                        conn.execute(text('ALTER TABLE exit_records ADD COLUMN archived_at TIMESTAMP'))
                        conn.commit()
            except Exception:
                pass

            try:
                inspector = inspect(engine)
                archived_columns = [col['name'] for col in inspector.get_columns('archived_employees')]
                if 'full_name' not in archived_columns:
                    with engine.connect() as conn:
                        conn.execute(text('ALTER TABLE archived_employees ADD COLUMN full_name VARCHAR(255)'))
                        conn.execute(text("""
                            UPDATE archived_employees
                            SET full_name = TRIM(
                                COALESCE(first_name, '') ||
                                CASE
                                    WHEN last_name IS NOT NULL AND TRIM(last_name) <> '' THEN ' ' || last_name
                                    ELSE ''
                                END
                            )
                            WHERE full_name IS NULL OR TRIM(full_name) = ''
                        """))
                        conn.commit()
            except Exception:
                pass

            try:
                inspector = inspect(engine)
                cand_columns = [col['name'] for col in inspector.get_columns('candidates')]
                for col_name, col_type in [('rejected_at', 'TIMESTAMP'), ('rejection_reason', 'TEXT')]:
                    if col_name not in cand_columns:
                        with engine.connect() as conn:
                            conn.execute(text(f'ALTER TABLE candidates ADD COLUMN {col_name} {col_type}'))
                            conn.commit()
            except Exception:
                pass
    else:
        print("Skipping runtime schema sync. Apply schema using Alembic migrations.")
        # In production, still attempt the idempotent enterprise index sync so
        # the optimized composite indexes are present regardless of migration state.
        try:
            from core.index_sync import sync_enterprise_indexes
            sync_enterprise_indexes(engine)
        except Exception as e:
            print(f"Enterprise index sync warning (production): {e}")
    
    # Create initial data (users) - only if SEED_DEFAULT_USERS is true
    db = SessionLocal()
    
    try:
        if not SEED_DEFAULT_USERS:
            print("Skipping default user seed. Set SEED_DEFAULT_USERS=true to seed local/dev users.")
            print(f"Database initialized successfully (URL: {DATABASE_URL})")
            return

        # Load environment variables for admin user
        admin_email = os.getenv('ADMIN_EMAIL', 'admin@hrms')
        admin_password = os.getenv('ADMIN_PASSWORD')
        if not admin_password:
            raise RuntimeError("ADMIN_PASSWORD environment variable must be set")

        # Truncate password to 72 bytes max for bcrypt
        admin_password = admin_password[:72]

        # Create password context - use pbkdf2_sha256 instead of bcrypt to avoid 72-byte limit
        from passlib.context import CryptContext
        pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

        # Ensure a default organization exists for SaaS multi-tenant
        org = db.query(Organization).filter(Organization.code == "DEFAULT").first()
        if not org:
            org = Organization(
                name="Default Organization",
                code="DEFAULT",
                status="active",
                default_currency="INR",
                timezone="Asia/Kolkata",
                registered_state="Karnataka",
            )
            db.add(org)
            db.commit()
            db.refresh(org)
            print(f"Created default organization: {org.name} (ID: {org.id})")

        # Check if admin user exists
        admin_user = db.query(User).filter(User.email == admin_email).first()

        # Fix existing users and employees that don't have an org_id (migration from old seed)
        for orphan in db.query(User).filter(User.organization_id.is_(None)).all():
            orphan.organization_id = org.id
        for orphan in db.query(Employee).filter(Employee.organization_id.is_(None)).all():
            orphan.organization_id = org.id
        db.commit()
        fixed_users = db.query(User).filter(User.organization_id == org.id).count()
        fixed_emps = db.query(Employee).filter(Employee.organization_id == org.id).count()
        print(f"Org ID {org.id} assigned to {fixed_users} users, {fixed_emps} employees")

        if not admin_user:
            # Create admin user using pbkdf2_sha256 which has no password length limitation
            admin_user = User(
                email=admin_email,
                password_hash=pwd_context.hash(admin_password),
                full_name='Admin User',
                role='admin',
                is_active=True,
                organization_id=org.id,
            )
            db.add(admin_user)
            db.commit()
            db.refresh(admin_user)

            # Create admin employee record
            admin_employee = Employee(
                user_id=admin_user.id,
                full_name='Admin User',
                first_name='Admin',
                last_name='User',
                email=admin_email,
                employee_code='ADM-001',
                designation='Administrator',
                status='active',
                organization_id=org.id,
            )
            db.add(admin_employee)
            db.commit()
            db.refresh(admin_employee)

            print(f"Admin user created successfully with email: {admin_email}")
        else:
            print(f"Admin user already exists with email: {admin_email}")

        # Create default users for each role
        roles = [
            ('superadmin@hrms.com', 'superadmin', 'Super Admin User'),
            ('hr@hrms.com', 'hr_executive', 'HR Executive'),
            ('manager@hrms.com', 'hr_manager', 'HR Manager'),
            ('employee@hrms.com', 'employee', 'Employee User')
        ]

        for email, role, full_name in roles:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                seed_password = os.getenv('SEED_PASSWORD')
                if not seed_password:
                    raise RuntimeError("SEED_PASSWORD environment variable must be set for seeding users")
                user = User(
                    email=email,
                    password_hash=pwd_context.hash(seed_password),
                    full_name=full_name,
                    role=role,
                    is_active=True,
                    organization_id=org.id,
                )
                db.add(user)
                db.commit()
                db.refresh(user)

                # Create employee record for non-admin roles
                if role != 'admin':
                    employee = Employee(
                        user_id=user.id,
                        first_name=full_name.split()[0] if full_name.split() else full_name,
                        last_name=' '.join(full_name.split()[1:]) if len(full_name.split()) > 1 else '',
                        full_name=full_name,
                        email=email,
                        employee_code=f"{role.upper()}-001",
                        designation=full_name,
                        status='active',
                        organization_id=org.id,
                    )
                    db.add(employee)
                    db.commit()
                    print(f"Created {role} user: {email}")
            else:
                print(f"{role} user already exists: {email}")

        # Create default statutory settings for the org
        existing_stat = db.query(StatutorySetting).filter(
            StatutorySetting.organization_id == org.id
        ).first()
        if not existing_stat:
            stat = StatutorySetting(
                organization_id=org.id,
                pf_applicable=True,
                pf_employee_rate=12.0,
                pf_employer_rate=12.0,
                pf_max_monthly=1800.0,
                pf_min_basic_for_exclusion=15000.0,
                esi_applicable=True,
                esi_employee_rate=0.75,
                esi_employer_rate=3.25,
                esi_gross_ceiling=21000.0,
                pt_applicable=True,
                pt_monthly_amount=200.0,
                pt_min_gross=10000.0,
                lwf_applicable=False,
                lwf_employee_rate=0.0,
                lwf_employer_rate=0.0,
                gratuity_applicable=True,
                gratuity_rate=4.81,
            )
            db.add(stat)
            db.commit()
            print("Default statutory settings created")

        print("Database initialization completed")
        
    except Exception as e:
        db.rollback()
        print(f"Error initializing database: {e}")
    finally:
        db.close()
    
    # Print database info
    print(f"Database initialized successfully (URL: {DATABASE_URL})")
