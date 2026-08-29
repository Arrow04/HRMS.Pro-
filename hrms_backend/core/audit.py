from sqlalchemy import event
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import get_history
import json

from models import ActivityLog

# List of models to exclude from automatic auditing
EXCLUDE_MODELS = ['ActivityLog', 'DeviceLog', 'AuditLog', 'SystemHealthLog', 'ReportExecutionLog']

def setup_auditing():
    @event.listens_for(Session, 'after_flush')
    def receive_after_flush(session, flush_context):
        from core.auth import request_context
        context = request_context.get()
        if not context:
            return  # No request context (e.g. background task)
            
        user_id = context.get('user_id')
        user_name = context.get('user_name', 'System')
        ip_address = context.get('ip_address')
        user_agent = context.get('user_agent', 'Unknown')
        
        device_info = "Unknown"
        if user_agent and user_agent != "Unknown":
            if "Windows" in user_agent: device_info = "Windows"
            elif "Macintosh" in user_agent or "Mac OS" in user_agent: device_info = "MacOS"
            elif "Linux" in user_agent: device_info = "Linux"
            elif "Android" in user_agent: device_info = "Android"
            elif "iPhone" in user_agent or "iPad" in user_agent: device_info = "iOS"
            else: device_info = "Other"

        default_module = context.get('module', 'System')

        logs_to_add = []

        for obj in session.new:
            model_name = obj.__class__.__name__
            if model_name in EXCLUDE_MODELS:
                continue
                
            # Convert obj to dict for new_value
            new_val = {c.name: getattr(obj, c.name) for c in obj.__table__.columns if hasattr(obj, c.name)}
            # Remove sensitive data like passwords
            if 'password_hash' in new_val: new_val['password_hash'] = '***'
            
            logs_to_add.append(ActivityLog(
                user_id=user_id,
                module=default_module,
                action='create',
                entity_type=model_name,
                entity_id=str(getattr(obj, 'id', '')),
                entity_name=str(getattr(obj, 'name', getattr(obj, 'title', model_name))),
                new_value=json.dumps(new_val, default=str),
                ip_address=ip_address,
                user_agent=user_agent,
                device_info=device_info
            ))

        for obj in session.dirty:
            model_name = obj.__class__.__name__
            if model_name in EXCLUDE_MODELS:
                continue
                
            old_val = {}
            new_val = {}
            
            for attr in obj.__mapper__.attrs:
                if hasattr(attr, 'columns'):
                    hist = get_history(obj, attr.key)
                    if hist.has_changes():
                        old_val[attr.key] = hist.deleted[0] if hist.deleted else None
                        new_val[attr.key] = hist.added[0] if hist.added else None
            
            if not old_val and not new_val:
                continue
                
            # Check for toggle_active/toggle_inactive
            action = 'edit'
            if len(new_val) == 1 and 'is_active' in new_val:
                action = 'toggle_active' if new_val['is_active'] else 'toggle_inactive'
                
            if 'password_hash' in new_val: new_val['password_hash'] = '***'
            if 'password_hash' in old_val: old_val['password_hash'] = '***'

            logs_to_add.append(ActivityLog(
                user_id=user_id,
                module=default_module,
                action=action,
                entity_type=model_name,
                entity_id=str(getattr(obj, 'id', '')),
                entity_name=str(getattr(obj, 'name', getattr(obj, 'title', model_name))),
                old_value=json.dumps(old_val, default=str),
                new_value=json.dumps(new_val, default=str),
                ip_address=ip_address,
                user_agent=user_agent,
                device_info=device_info
            ))

        for obj in session.deleted:
            model_name = obj.__class__.__name__
            if model_name in EXCLUDE_MODELS:
                continue

            old_val = {c.name: getattr(obj, c.name) for c in obj.__table__.columns if hasattr(obj, c.name)}
            if 'password_hash' in old_val: old_val['password_hash'] = '***'

            logs_to_add.append(ActivityLog(
                user_id=user_id,
                module=default_module,
                action='delete',
                entity_type=model_name,
                entity_id=str(getattr(obj, 'id', '')),
                entity_name=str(getattr(obj, 'name', getattr(obj, 'title', model_name))),
                old_value=json.dumps(old_val, default=str),
                ip_address=ip_address,
                user_agent=user_agent,
                device_info=device_info
            ))
            
        if logs_to_add:
            session.add_all(logs_to_add)


def log_activity(
    db: Session,
    user_id: int,
    module: str,
    action: str,
    entity_type: str = None,
    entity_id: str = None,
    entity_name: str = None,
    old_value: str = None,
    new_value: str = None,
    ip_address: str = None,
    mac_address: str = None,
    device_info: str = None,
    user_agent: str = None,
):
    from models import ActivityLog

    new_log = ActivityLog(
        user_id=user_id,
        module=module,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        entity_name=entity_name,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address,
        mac_address=mac_address,
        device_info=device_info,
        user_agent=user_agent,
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    return new_log


def get_client_info(request) -> dict:
    client_host = request.client.host if request.client else "Unknown"
    user_agent = request.headers.get("user-agent", "Unknown")

    device_info = "Unknown"
    if user_agent != "Unknown":
        if "Windows" in user_agent:
            device_info = "Windows"
        elif "Macintosh" in user_agent or "Mac OS" in user_agent:
            device_info = "MacOS"
        elif "Linux" in user_agent:
            device_info = "Linux"
        elif "Android" in user_agent:
            device_info = "Android"
        elif "iPhone" in user_agent or "iPad" in user_agent:
            device_info = "iOS"
        else:
            device_info = "Other"

    return {
        "ip_address": client_host,
        "mac_address": None,
        "device_info": device_info,
        "user_agent": user_agent,
    }

