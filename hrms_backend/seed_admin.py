from database import engine, SessionLocal
from sqlalchemy import text
from core.auth import get_password_hash

db = SessionLocal()
try:
    # Check if any user exists
    count = db.execute(text("SELECT COUNT(*) FROM users")).scalar()
    if count > 0:
        print(f"Users already exist ({count}), skipping seed")
    else:
        # Create default admin
        db.execute(text("""
            INSERT INTO users (email, password_hash, full_name, role, is_active)
            VALUES (:email, :pwd, :name, :role, true)
        """), {
            "email": "admin@example.com",
            "pwd": get_password_hash("admin123"),
            "name": "System Admin",
            "role": "admin",
        })
        db.commit()
        print("Created admin user: admin@example.com / admin123")
except Exception as e:
    db.rollback()
    print(f"Error: {e}")
finally:
    db.close()
