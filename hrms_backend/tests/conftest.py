# NOTE: Environment variables MUST be set BEFORE importing database/main.
# database.py reads DATABASE_URL at import time; if we imported the app first,
# the engine would point at whatever DATABASE_URL was in the shell (e.g. the
# real Postgres DB) and the session-scoped `engine` fixture would drop the
# PRODUCTION tables on teardown. Setting env first guarantees tests only ever
# touch the isolated Postgres test DB (hrms_test) — never the real one.
import os

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+psycopg2://postgres:123456@localhost:5432/hrms_test",
)
os.environ["ALLOW_SQLITE_FALLBACK"] = "false"
os.environ["RUN_SCHEMA_SYNC"] = "false"
os.environ["SEED_DEFAULT_USERS"] = "true"
os.environ["JWT_SECRET_KEY"] = "test-secret-key"
os.environ["REDIS_URL"] = "redis://localhost:6379/0"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Safe import order: database/main must read the test env set above.
from database import Base, get_db, engine as app_engine
from main import app


@pytest.fixture(scope="session")
def engine():
    # Always use the isolated Postgres test DB (env was set before import).
    if app_engine.url.database != "hrms_test":
        raise RuntimeError(
            f"Tests must run against the hrms_test database, got {app_engine.url}. "
            "TEST_DATABASE_URL was not overridden before imports."
        )
    Base.metadata.create_all(bind=app_engine)

    # Seed a default admin user for tests
    from core.auth import get_password_hash
    from models import User, Organization
    Session = sessionmaker(bind=app_engine)
    db = Session()
    try:
        # Create default organization
        org = db.query(Organization).filter(Organization.code == "TEST").first()
        if not org:
            org = Organization(
                name="Test Organization",
                code="TEST",
                status="active",
                default_currency="INR",
                timezone="Asia/Kolkata",
            )
            db.add(org)
            db.commit()
            db.refresh(org)

        # Create admin user
        admin_email = os.getenv("ADMIN_EMAIL", "admin@hrms.com")
        admin_password = os.getenv("ADMIN_PASSWORD", "admin123")
        existing = db.query(User).filter(User.email == admin_email).first()
        if not existing:
            admin = User(
                email=admin_email,
                password_hash=get_password_hash(admin_password),
                full_name="Test Admin",
                role="admin",
                is_active=True,
                organization_id=org.id,
            )
            db.add(admin)
            db.commit()
    finally:
        db.close()

    yield app_engine
    # Drop all tables in reverse dependency order with FK checks off to
    # avoid CircularDependencyError from the mutually-referencing schema.
    with app_engine.connect() as conn:
        conn.execute(text("SET session_replication_role = replica"))
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(text(f'DROP TABLE IF EXISTS "{table.name}" CASCADE'))
        conn.execute(text("SET session_replication_role = DEFAULT"))
        conn.commit()


@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    # Plain TestClient (no `with`): the app lifespan starts process-wide
    # background loops and only works once per process — re-entering it for
    # every test hangs the second startup forever. Endpoint tests don't need
    # the lifespan (test_company_scope uses this same pattern).
    c = TestClient(app)
    # Get admin user ID for test assertions
    from models import User
    admin_user = db_session.query(User).filter(User.email == os.getenv("ADMIN_EMAIL", "admin@hrms.com")).first()
    c.admin_user_id = admin_user.id if admin_user else 1
    yield c
    app.dependency_overrides.clear()


@pytest.fixture
def admin_token(client):
    resp = client.post("/api/auth/login", json={
        "email": os.getenv("ADMIN_EMAIL", "admin@hrms.com"),
        "password": os.getenv("ADMIN_PASSWORD", "admin123"),
    })
    data = resp.json()
    return data.get("token", data.get("access_token", ""))
