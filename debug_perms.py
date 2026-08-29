from database import engine, SessionLocal
from models import User
from routers.dynamic_permissions import PermissionChecker

db = SessionLocal()
try:
    user = db.query(User).filter(User.email == 'admin@hrms.com').first()
    print(f"User: {user.email}, role: {user.role}, org_id: {user.organization_id}")
    
    checker = PermissionChecker(db)
    
    # Check various permissions
    for module in ['attendance', 'employees', 'dashboard']:
        for action in ['read', 'write']:
            result = checker.has_permission(user, module, action)
            print(f"  {module}:{action} = {result}")
    
    # Check get_user_permissions
    perms = checker.get_user_permissions(user)
    print(f"\nAll permissions: {perms}")
finally:
    db.close()
