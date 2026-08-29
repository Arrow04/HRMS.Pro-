from database import SessionLocal
from sqlalchemy import text

db = SessionLocal()
try:
    org_count = db.execute(text("SELECT COUNT(*) FROM organizations")).scalar()
    print(f"Organizations: {org_count}")
    if org_count == 0:
        db.execute(text("INSERT INTO organizations (name, code, status) VALUES ('Default Organization', 'DEFAULT', 'active')"))
        db.commit()
        print("Created default organization")
    
    user = db.execute(text("SELECT id, email, organization_id FROM users WHERE email='admin@example.com'")).first()
    if user:
        print(f"User: id={user.id} email={user.email} org_id={user.organization_id}")
        if not user.organization_id:
            org = db.execute(text("SELECT id FROM organizations LIMIT 1")).first()
            if org:
                db.execute(text("UPDATE users SET organization_id=:oid WHERE id=:uid"), {"oid": org.id, "uid": user.id})
                db.commit()
                print(f"Assigned org {org.id} to user {user.id}")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
