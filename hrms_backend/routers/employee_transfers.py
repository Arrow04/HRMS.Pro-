from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
from database import get_db
from models import EmployeeTransfer, Employee, Branch, Department, Designation, User, EmployeeLifecycleEvent, Company
from routers.auth import get_current_user
from core.audit import log_activity
from core.datetime_utils import ist_now_naive
from core.tenant import get_employee_in_org, org_owned, validate_company_in_org

router = APIRouter(tags=["employee-transfers"])


def _transfer_owned(db: Session, transfer, org_id: int):
    """Raise 404 unless the transfer's employee belongs to the caller's org."""
    if transfer is None:
        raise HTTPException(status_code=404, detail="Transfer not found")
    emp = db.query(Employee).filter(Employee.id == transfer.employee_id).first()
    if emp is None or int(emp.organization_id) != int(org_id):
        raise HTTPException(status_code=404, detail="Transfer not found")
    return transfer

# Pydantic Schemas
class TransferCreate(BaseModel):
    employee_id: int
    from_company_id: Optional[int] = None
    from_branch_id: int
    from_branch_ids: Optional[List[int]] = None
    from_department_id: Optional[int] = None
    from_designation_id: Optional[int] = None
    to_company_id: Optional[int] = None
    to_branch_id: Optional[int] = None
    to_branch_ids: Optional[List[int]] = None
    to_department_id: Optional[int] = None
    to_designation_id: Optional[int] = None
    type: str  # temporary, permanent
    start_date: str
    end_date: Optional[str] = None
    reason: str

class TransferUpdate(BaseModel):
    status: Optional[str] = None
    approved_by: Optional[int] = None
    notes: Optional[str] = None
    # Editable details (pending transfers only)
    from_company_id: Optional[int] = None
    from_branch_id: Optional[int] = None
    from_branch_ids: Optional[List[int]] = None
    from_department_id: Optional[int] = None
    from_designation_id: Optional[int] = None
    to_company_id: Optional[int] = None
    to_branch_id: Optional[int] = None
    to_branch_ids: Optional[List[int]] = None
    to_department_id: Optional[int] = None
    to_designation_id: Optional[int] = None
    type: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    reason: Optional[str] = None

class TransferResponse(BaseModel):
    id: int
    employee_id: int
    employee_name: str
    from_company_id: Optional[int] = None
    from_company_name: Optional[str] = None
    from_branch_id: int
    from_branch_ids: Optional[List[int]] = None
    from_branch_name: str
    from_branch_names: Optional[List[str]] = None
    from_department_id: Optional[int]
    from_department_name: Optional[str]
    from_designation_id: Optional[int] = None
    from_designation_name: Optional[str] = None
    to_company_id: Optional[int] = None
    to_company_name: Optional[str] = None
    to_branch_id: int
    to_branch_ids: Optional[List[int]] = None
    to_branch_name: str
    to_branch_names: Optional[List[str]] = None
    to_department_id: Optional[int]
    to_department_name: Optional[str]
    to_designation_id: Optional[int] = None
    to_designation_name: Optional[str] = None
    type: str
    start_date: str
    end_date: Optional[str]
    reason: str
    status: str
    requested_by: Optional[str]
    approved_by: Optional[str]
    approved_at: Optional[str]
    created_at: str

    class Config:
        from_attributes = True

# Create transfer
@router.post("", response_model=TransferResponse)
def create_transfer(
    transfer: TransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new employee transfer request"""
    
    # Validate employee exists
    if current_user.role != "superadmin":
        employee = get_employee_in_org(db, Employee, transfer.employee_id, current_user.organization_id)
    else:
        employee = db.query(Employee).filter(Employee.id == transfer.employee_id).first()
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
    
    # Resolve target branches (support single or multiple)
    target_ids = transfer.to_branch_ids or ([transfer.to_branch_id] if transfer.to_branch_id else [])
    if not target_ids:
        raise HTTPException(status_code=400, detail="At least one target branch is required")
    if len(target_ids) != len(set(target_ids)):
        raise HTTPException(status_code=400, detail="Duplicate target branches are not allowed")
    to_branches = db.query(Branch).filter(Branch.id.in_(target_ids)).all()
    if len(to_branches) != len(target_ids):
        raise HTTPException(status_code=404, detail="One or more target branches not found")
    
    # Validate from branch exists
    from_branch = db.query(Branch).filter(Branch.id == transfer.from_branch_id).first()
    if not from_branch:
        raise HTTPException(status_code=404, detail="From branch not found")

    # Validate all from/to targets belong to the caller's org (superadmin bypass)
    if current_user.role != "superadmin":
        for b in to_branches:
            org_owned(b, current_user.organization_id)
        org_owned(from_branch, current_user.organization_id)
        if transfer.from_company_id:
            validate_company_in_org(db, Company, transfer.from_company_id, current_user.organization_id)
        if transfer.to_company_id:
            validate_company_in_org(db, Company, transfer.to_company_id, current_user.organization_id)
        for did in (transfer.from_department_id, transfer.to_department_id):
            if did:
                dept = db.query(Department).filter(Department.id == int(did)).first()
                org_owned(dept, current_user.organization_id)
    
    primary_to_id = target_ids[0]
    # Create transfer record
    db_transfer = EmployeeTransfer(
        employee_id=transfer.employee_id,
        from_company_id=transfer.from_company_id,
        from_branch_id=transfer.from_branch_id,
        from_branch_ids=transfer.from_branch_ids or [transfer.from_branch_id],
        from_department_id=transfer.from_department_id,
        from_designation_id=transfer.from_designation_id,
        to_company_id=transfer.to_company_id,
        to_branch_id=primary_to_id,
        to_branch_ids=target_ids,
        to_department_id=transfer.to_department_id,
        to_designation_id=transfer.to_designation_id,
        type=transfer.type,
        start_date=datetime.fromisoformat(transfer.start_date),
        end_date=datetime.fromisoformat(transfer.end_date) if transfer.end_date else None,
        reason=transfer.reason,
        status='pending',
        requested_by=current_user.id
    )
    
    db.add(db_transfer)
    db.commit()
    db.refresh(db_transfer)
    
    target_names = ", ".join(b.name for b in to_branches)
    # Create lifecycle event
    lifecycle_event = EmployeeLifecycleEvent(
        employee_id=transfer.employee_id,
        event_type='transfer',
        event_date=ist_now_naive(),
        description=f"Transfer requested from {from_branch.name} to {target_names}",
        from_value=from_branch.name,
        to_value=target_names,
        recorded_by=current_user.id
    )
    db.add(lifecycle_event)
    db.commit()

    # Record activity log so the History modal shows the create event
    try:
        log_activity(
            db=db, user_id=current_user.id, module="employees", action="create",
            entity_type="employee_transfer", entity_id=str(db_transfer.id),
            entity_name=f"Transfer {db_transfer.id}",
            old_value=None,
            new_value=f"Transfer requested for employee {transfer.employee_id} from {from_branch.name} to {target_names} (type={transfer.type})",
        )
    except Exception as e:
        print(f"Error logging transfer activity: {e}")
        db.rollback()
    
    return _format_transfer_response(db_transfer, db)

# Get all transfers
@router.get("", response_model=List[TransferResponse])
def get_transfers(
    employee_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all transfers with optional filters"""
    
    query = db.query(EmployeeTransfer)
    if current_user.role != "superadmin":
        query = query.join(Employee, EmployeeTransfer.employee_id == Employee.id).filter(
            Employee.organization_id == current_user.organization_id
        )
    
    if employee_id:
        query = query.filter(EmployeeTransfer.employee_id == employee_id)
    
    if status:
        query = query.filter(EmployeeTransfer.status == status)
    
    transfers = query.order_by(EmployeeTransfer.created_at.desc()).all()
    
    return [_format_transfer_response(t, db) for t in transfers]

# Get single transfer
@router.get("/{transfer_id}", response_model=TransferResponse)
def get_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific transfer by ID"""
    
    transfer = db.query(EmployeeTransfer).filter(EmployeeTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if current_user.role != "superadmin":
        _transfer_owned(db, transfer, current_user.organization_id)
    
    return _format_transfer_response(transfer, db)

# Update transfer (approve/reject)
@router.put("/{transfer_id}", response_model=TransferResponse)
def update_transfer(
    transfer_id: int,
    update: TransferUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update transfer status (approve/reject)"""
    
    transfer = db.query(EmployeeTransfer).filter(EmployeeTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if current_user.role != "superadmin":
        _transfer_owned(db, transfer, current_user.organization_id)
    
    # Editing pending transfer details
    edit_fields = [
        "from_company_id", "from_branch_id", "from_department_id", "from_designation_id",
        "to_company_id", "to_branch_id", "to_branch_ids", "to_department_id", "to_designation_id",
        "type", "start_date", "end_date", "reason",
    ]
    has_edits = any(getattr(update, f) is not None for f in edit_fields)
    if has_edits:
        if update.from_branch_id is not None:
            transfer.from_branch_id = update.from_branch_id
        if update.from_branch_ids is not None:
            transfer.from_branch_ids = update.from_branch_ids
        if update.from_company_id is not None:
            transfer.from_company_id = update.from_company_id
        if update.from_department_id is not None:
            transfer.from_department_id = update.from_department_id
        if update.from_designation_id is not None:
            transfer.from_designation_id = update.from_designation_id
        if update.to_company_id is not None:
            transfer.to_company_id = update.to_company_id
        if update.to_branch_ids is not None:
            transfer.to_branch_ids = update.to_branch_ids
            transfer.to_branch_id = update.to_branch_ids[0] if update.to_branch_ids else transfer.to_branch_id
        elif update.to_branch_id is not None:
            transfer.to_branch_id = update.to_branch_id
            transfer.to_branch_ids = [update.to_branch_id]
        if update.to_department_id is not None:
            transfer.to_department_id = update.to_department_id
        if update.to_designation_id is not None:
            transfer.to_designation_id = update.to_designation_id
        if update.type is not None:
            transfer.type = update.type
        if update.start_date is not None:
            try:
                transfer.start_date = datetime.fromisoformat(update.start_date)
            except Exception:
                pass
        if update.end_date is not None:
            try:
                transfer.end_date = datetime.fromisoformat(update.end_date) if update.end_date else None
            except Exception:
                pass
        if update.reason is not None:
            transfer.reason = update.reason
        try:
            log_activity(
                db=db, user_id=current_user.id, module="employees", action="edit",
                entity_type="employee_transfer", entity_id=str(transfer.id),
                entity_name=f"Transfer {transfer.id}",
                old_value="pending", new_value="pending (edited)",
            )
        except Exception as e:
            print(f"Error logging transfer activity: {e}")
            db.rollback()
    
    if update.status:
        transfer.status = update.status
        
        # If approved, update employee's branch/department
        if update.status == 'approved':
            transfer.approved_by = current_user.id
            transfer.approved_at = ist_now_naive()
    
    if update.notes:
        transfer.notes = update.notes
    
    db.commit()
    db.refresh(transfer)
    
    # Add lifecycle event for approval/rejection
    if update.status in ['approved', 'rejected']:
        event_desc = f"Transfer {update.status}"
        lifecycle_event = EmployeeLifecycleEvent(
            employee_id=transfer.employee_id,
            event_type='transfer',
            event_date=ist_now_naive(),
            description=event_desc,
            from_value=transfer.from_branch.name if update.status == 'rejected' else None,
            to_value=transfer.to_branch.name if update.status == 'approved' else None,
            recorded_by=current_user.id
        )
        db.add(lifecycle_event)
        db.commit()
        try:
            log_activity(
                db=db, user_id=current_user.id, module="employees", action=update.status,
                entity_type="employee_transfer", entity_id=str(transfer.id),
                entity_name=f"Transfer {transfer.id}",
                old_value="pending",
                new_value=update.status,
            )
        except Exception as e:
            print(f"Error logging transfer activity: {e}")
            db.rollback()
    
    return _format_transfer_response(transfer, db)

# Approve transfer (UI sub-path used by hrms_react_web)
@router.put("/{transfer_id}/approve", response_model=TransferResponse)
def approve_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Approve a transfer request (employee transfers UI)."""
    transfer = db.query(EmployeeTransfer).filter(EmployeeTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if current_user.role != "superadmin":
        _transfer_owned(db, transfer, current_user.organization_id)
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending transfers can be approved")
    transfer.status = "approved"
    transfer.approved_by = current_user.id
    transfer.approved_at = ist_now_naive()
    event = EmployeeLifecycleEvent(
        employee_id=transfer.employee_id,
        event_type="transfer",
        event_date=ist_now_naive(),
        description="Transfer approved",
        recorded_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(transfer)
    try:
        log_activity(
            db=db, user_id=current_user.id, module="employees", action="approve",
            entity_type="employee_transfer", entity_id=str(transfer.id),
            entity_name=f"Transfer {transfer.id}",
            old_value="pending", new_value="approved",
        )
    except Exception as e:
        print(f"Error logging transfer activity: {e}")
        db.rollback()
    return _format_transfer_response(transfer, db)

# Complete transfer (UI sub-path used by hrms_react_web)
@router.put("/{transfer_id}/complete", response_model=TransferResponse)
def complete_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Complete an approved transfer (actually moves the employee)."""
    transfer = db.query(EmployeeTransfer).filter(EmployeeTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if current_user.role != "superadmin":
        _transfer_owned(db, transfer, current_user.organization_id)
    if transfer.status not in ("approved", "in_progress"):
        raise HTTPException(status_code=400, detail="Only approved transfers can be completed")
    transfer.status = "completed"
    employee = db.query(Employee).filter(Employee.id == transfer.employee_id).first()
    if employee:
        if transfer.to_company_id:
            employee.company_id = transfer.to_company_id
            # Also sync the many-to-many companies relationship (what the UI reads)
            to_company = db.query(Company).filter(Company.id == transfer.to_company_id).first()
            if to_company:
                employee.companies = [to_company]
        # Branches are many-to-many — replace the from-branch with the target branch(es)
        from models import EmployeeBranchAssignment
        # Remove the source branch assignment only for permanent moves.
        # Temporary transfers keep the original branch so they can be reverted.
        if transfer.type == "permanent":
            if transfer.from_branch_id:
                from_assn = db.query(EmployeeBranchAssignment).filter(
                    EmployeeBranchAssignment.employee_id == employee.id,
                    EmployeeBranchAssignment.branch_id == transfer.from_branch_id,
                    EmployeeBranchAssignment.status == "active",
                    EmployeeBranchAssignment.deleted_at.is_(None),
                ).first()
                if from_assn:
                    from_assn.status = "inactive"
                    from_assn.end_date = ist_now_naive()
                from_branch = db.query(Branch).filter(Branch.id == transfer.from_branch_id).first()
                if from_branch and from_branch in employee.branches:
                    employee.branches.remove(from_branch)
        # Add all target branch assignments
        target_ids = transfer.to_branch_ids or ([transfer.to_branch_id] if transfer.to_branch_id else [])
        for bid in target_ids:
            to_assn = db.query(EmployeeBranchAssignment).filter(
                EmployeeBranchAssignment.employee_id == employee.id,
                EmployeeBranchAssignment.branch_id == bid,
                EmployeeBranchAssignment.status == "active",
                EmployeeBranchAssignment.deleted_at.is_(None),
            ).first()
            if not to_assn:
                db.add(EmployeeBranchAssignment(
                    employee_id=employee.id,
                    branch_id=bid,
                    is_primary=False,
                    start_date=ist_now_naive(),
                    status="active",
                ))
            to_branch = db.query(Branch).filter(Branch.id == bid).first()
            if to_branch and to_branch not in employee.branches:
                employee.branches.append(to_branch)
        if transfer.to_department_id:
            employee.department_id = transfer.to_department_id
        if transfer.to_designation_id:
            employee.designation_id = transfer.to_designation_id
            # Sync the display string so the UI (which reads designation text) stays consistent
            target_desig = db.query(Designation).filter(Designation.id == transfer.to_designation_id).first()
            if target_desig:
                employee.designation = target_desig.title
    event = EmployeeLifecycleEvent(
        employee_id=transfer.employee_id,
        event_type="transfer",
        event_date=ist_now_naive(),
        description="Transfer completed",
        recorded_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(transfer)
    try:
        log_activity(
            db=db, user_id=current_user.id, module="employees", action="complete",
            entity_type="employee_transfer", entity_id=str(transfer.id),
            entity_name=f"Transfer {transfer.id}",
            old_value="approved", new_value="completed",
        )
    except Exception as e:
        print(f"Error logging transfer activity: {e}")
        db.rollback()
    return _format_transfer_response(transfer, db)


# Revert a completed transfer — restores the original assignment
@router.put("/{transfer_id}/revert", response_model=TransferResponse)
def revert_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revert a completed transfer (employee returns to original branch/company/department/designation)."""
    transfer = db.query(EmployeeTransfer).filter(EmployeeTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if current_user.role != "superadmin":
        _transfer_owned(db, transfer, current_user.organization_id)
    if transfer.status != "completed":
        raise HTTPException(status_code=400, detail="Only completed transfers can be reverted")

    employee = db.query(Employee).filter(Employee.id == transfer.employee_id).first()
    if employee:
        from models import EmployeeBranchAssignment
        # Remove all target branch assignments
        target_ids = transfer.to_branch_ids or ([transfer.to_branch_id] if transfer.to_branch_id else [])
        for bid in target_ids:
            to_assn = db.query(EmployeeBranchAssignment).filter(
                EmployeeBranchAssignment.employee_id == employee.id,
                EmployeeBranchAssignment.branch_id == bid,
                EmployeeBranchAssignment.status == "active",
                EmployeeBranchAssignment.deleted_at.is_(None),
            ).first()
            if to_assn:
                to_assn.status = "inactive"
                to_assn.end_date = ist_now_naive()
            to_branch = db.query(Branch).filter(Branch.id == bid).first()
            if to_branch and to_branch in employee.branches:
                employee.branches.remove(to_branch)
        # Reactivate the original from-branches (all of them)
        from_ids = transfer.from_branch_ids or ([transfer.from_branch_id] if transfer.from_branch_id else [])
        for fid in from_ids:
            from_assn = db.query(EmployeeBranchAssignment).filter(
                EmployeeBranchAssignment.employee_id == employee.id,
                EmployeeBranchAssignment.branch_id == fid,
                EmployeeBranchAssignment.deleted_at.is_(None),
            ).order_by(EmployeeBranchAssignment.id.desc()).first()
            if from_assn:
                from_assn.status = "active"
                from_assn.end_date = None
            else:
                db.add(EmployeeBranchAssignment(
                    employee_id=employee.id,
                    branch_id=fid,
                    is_primary=False,
                    start_date=ist_now_naive(),
                    status="active",
                ))
            from_branch = db.query(Branch).filter(Branch.id == fid).first()
            if from_branch and from_branch not in employee.branches:
                employee.branches.append(from_branch)
        # Restore original company / department / designation
        if transfer.from_company_id:
            employee.company_id = transfer.from_company_id
            from_company = db.query(Company).filter(Company.id == transfer.from_company_id).first()
            if from_company:
                employee.companies = [from_company]
        if transfer.from_department_id:
            employee.department_id = transfer.from_department_id
        if transfer.from_designation_id:
            employee.designation_id = transfer.from_designation_id
            from_desig = db.query(Designation).filter(Designation.id == transfer.from_designation_id).first()
            if from_desig:
                employee.designation = from_desig.title

    transfer.status = "reverted"
    event = EmployeeLifecycleEvent(
        employee_id=transfer.employee_id,
        event_type="transfer",
        event_date=ist_now_naive(),
        description="Transfer reverted",
        recorded_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(transfer)
    try:
        log_activity(
            db=db, user_id=current_user.id, module="employees", action="revert",
            entity_type="employee_transfer", entity_id=str(transfer.id),
            entity_name=f"Transfer {transfer.id}",
            old_value="completed", new_value="reverted",
        )
    except Exception as e:
        print(f"Error logging transfer activity: {e}")
        db.rollback()
    return _format_transfer_response(transfer, db)

# Reject transfer (UI sub-path used by hrms_react_web)
@router.put("/{transfer_id}/reject", response_model=TransferResponse)
def reject_transfer(
    transfer_id: int,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Reject a transfer request."""
    transfer = db.query(EmployeeTransfer).filter(EmployeeTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if current_user.role != "superadmin":
        _transfer_owned(db, transfer, current_user.organization_id)
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending transfers can be rejected")
    transfer.status = "rejected"
    if reason:
        transfer.notes = reason
    event = EmployeeLifecycleEvent(
        employee_id=transfer.employee_id,
        event_type="transfer",
        event_date=ist_now_naive(),
        description=f"Transfer rejected: {reason or ''}",
        recorded_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(transfer)
    return _format_transfer_response(transfer, db)

# Delete transfer
@router.delete("/{transfer_id}")
def delete_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a transfer request (only if pending)"""
    
    transfer = db.query(EmployeeTransfer).filter(EmployeeTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if current_user.role != "superadmin":
        _transfer_owned(db, transfer, current_user.organization_id)
    
    if transfer.status != 'pending':
        raise HTTPException(status_code=400, detail="Can only delete pending transfers")
    
    db.delete(transfer)
    db.commit()
    
    return {"message": "Transfer deleted successfully"}

# Helper function to format transfer response
def _format_transfer_response(transfer: EmployeeTransfer, db: Session) -> dict:
    """Format transfer for API response"""
    
    employee = db.query(Employee).filter(Employee.id == transfer.employee_id).first()
    from_branch = db.query(Branch).filter(Branch.id == transfer.from_branch_id).first()
    to_branch = db.query(Branch).filter(Branch.id == transfer.to_branch_id).first()
    
    from_company = None
    to_company = None
    if transfer.from_company_id:
        from_company = db.query(Company).filter(Company.id == transfer.from_company_id).first()
    if transfer.to_company_id:
        to_company = db.query(Company).filter(Company.id == transfer.to_company_id).first()
    
    from_department = None
    to_department = None
    if transfer.from_department_id:
        from_department = db.query(Department).filter(Department.id == transfer.from_department_id).first()
    if transfer.to_department_id:
        to_department = db.query(Department).filter(Department.id == transfer.to_department_id).first()

    from_designation = None
    to_designation = None
    if transfer.from_designation_id:
        from_designation = db.query(Designation).filter(Designation.id == transfer.from_designation_id).first()
    if transfer.to_designation_id:
        to_designation = db.query(Designation).filter(Designation.id == transfer.to_designation_id).first()
    
    requester = None
    approver = None
    if transfer.requested_by:
        requester = db.query(User).filter(User.id == transfer.requested_by).first()
    if transfer.approved_by:
        approver = db.query(User).filter(User.id == transfer.approved_by).first()
    
    return {
        "id": transfer.id,
        "employee_id": transfer.employee_id,
        "employee_name": employee.full_name if employee else "Unknown",
        "from_company_id": transfer.from_company_id,
        "from_company_name": from_company.name if from_company else None,
        "from_branch_id": transfer.from_branch_id,
        "from_branch_ids": transfer.from_branch_ids or ([transfer.from_branch_id] if transfer.from_branch_id else []),
        "from_branch_name": from_branch.name if from_branch else "Unknown",
        "from_branch_names": [b.name for b in (db.query(Branch).filter(Branch.id.in_(transfer.from_branch_ids or [transfer.from_branch_id])).all())] if (transfer.from_branch_ids or transfer.from_branch_id) else [],
        "from_department_id": transfer.from_department_id,
        "from_department_name": from_department.name if from_department else None,
        "from_designation_id": transfer.from_designation_id,
        "from_designation_name": from_designation.title if from_designation else None,
        "to_company_id": transfer.to_company_id,
        "to_company_name": to_company.name if to_company else None,
        "to_branch_id": transfer.to_branch_id,
        "to_branch_ids": transfer.to_branch_ids or ([transfer.to_branch_id] if transfer.to_branch_id else []),
        "to_branch_name": to_branch.name if to_branch else "Unknown",
        "to_branch_names": [b.name for b in (db.query(Branch).filter(Branch.id.in_(transfer.to_branch_ids or [transfer.to_branch_id])).all())] if (transfer.to_branch_ids or transfer.to_branch_id) else [],
        "to_department_id": transfer.to_department_id,
        "to_department_name": to_department.name if to_department else None,
        "to_designation_id": transfer.to_designation_id,
        "to_designation_name": to_designation.title if to_designation else None,
        "type": transfer.type,
        "start_date": transfer.start_date.isoformat() if transfer.start_date else None,
        "end_date": transfer.end_date.isoformat() if transfer.end_date else None,
        "reason": transfer.reason,
        "status": transfer.status,
        "requested_by": requester.full_name if requester else None,
        "approved_by": approver.full_name if approver else None,
        "approved_at": transfer.approved_at.isoformat() if transfer.approved_at else None,
        "created_at": transfer.created_at.isoformat() if transfer.created_at else None
    }
