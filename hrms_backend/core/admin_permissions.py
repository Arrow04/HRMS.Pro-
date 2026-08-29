#!/usr/bin/env python3
"""Admin permissions and access control"""

from typing import List
from fastapi import HTTPException, status
from models import User

def check_admin_permission(current_user: User):
    """Check if user has admin-level permissions"""
    admin_roles = ['admin', 'superadmin']
    if current_user.role not in admin_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Admin access required. Current role: {current_user.role}"
        )
    return True

def check_full_admin_access(current_user: User):
    """Check if user has full admin access (admin or superadmin)"""
    return current_user.role in ['admin', 'superadmin']

def check_superadmin_only(current_user: User):
    """Check if user is superadmin only"""
    if current_user.role != 'superadmin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin access required"
        )
    return True

def get_accessible_organizations(current_user: User, db_session):
    """Get all organizations accessible to admin user"""
    if check_full_admin_access(current_user):
        # Admin users can access all organizations
        from models import Organization
        return db_session.query(Organization).all()
    return []

def get_accessible_companies(current_user: User, db_session):
    """Get all companies accessible to admin user"""
    if check_full_admin_access(current_user):
        # Admin users can access all companies
        from models import Company
        return db_session.query(Company).all()
    return []

def get_accessible_employees(current_user: User, db_session):
    """Get all employees accessible to admin user"""
    if check_full_admin_access(current_user):
        # Admin users can access all employees
        from models import Employee
        return db_session.query(Employee).all()
    return []

def can_access_all_data(current_user: User):
    """Check if user can access all system data"""
    return current_user.role in ['admin', 'superadmin']

def has_management_rights(current_user: User):
    """Check if user has management rights"""
    return current_user.role in ['admin', 'superadmin', 'hr_admin', 'hr_manager', 'hr_executive']

def has_employee_management_rights(current_user: User):
    """Check if user can manage employees"""
    return current_user.role in ['admin', 'superadmin', 'hr_admin', 'hr_manager', 'hr_executive']

def has_payroll_access(current_user: User):
    """Check if user can access payroll"""
    return current_user.role in ['admin', 'superadmin', 'hr_admin', 'hr_manager', 'hr_executive', 'finance']

# Role-based access control matrix
ROLE_PERMISSIONS = {
    'superadmin': {
        'can_manage_users': True,
        'can_manage_organizations': True,
        'can_manage_all_data': True,
        'can_access_reports': True,
        'can_manage_payroll': True,
        'can_manage_settings': True,
        'can_delete_data': True
    },
    'admin': {
        'can_manage_users': True,
        'can_manage_organizations': True,
        'can_manage_all_data': True,
        'can_access_reports': True,
        'can_manage_payroll': True,
        'can_manage_settings': True,
        'can_delete_data': True
    },
    'hr': {
        'can_manage_users': False,
        'can_manage_organizations': False,
        'can_manage_all_data': False,
        'can_access_reports': True,
        'can_manage_payroll': True,
        'can_manage_settings': False,
        'can_delete_data': False
    },
    'manager': {
        'can_manage_users': False,
        'can_manage_organizations': False,
        'can_manage_all_data': False,
        'can_access_reports': True,
        'can_manage_payroll': False,
        'can_manage_settings': False,
        'can_delete_data': False
    },
    'employee': {
        'can_manage_users': False,
        'can_manage_organizations': False,
        'can_manage_all_data': False,
        'can_access_reports': False,
        'can_manage_payroll': False,
        'can_manage_settings': False,
        'can_delete_data': False
    }
}

def has_permission(current_user: User, permission: str) -> bool:
    """Check if user has specific permission"""
    user_permissions = ROLE_PERMISSIONS.get(current_user.role, {})
    return user_permissions.get(permission, False)
