"""
Feature flag / org settings helpers.

Reads the organisation's feature toggles (geoFence, selfService, docUploads,
multiCompany) that are managed from the Settings page and stored in
organizations.settings["general"].
"""
from typing import Dict, Optional

from sqlalchemy.orm import Session

from models import Organization


def get_org_settings(db: Session, organization_id: Optional[int]) -> Dict:
    """Return the org settings dict (empty dict if unavailable)."""
    if not organization_id:
        return {}
    org = db.query(Organization).filter(
        Organization.deleted_at.is_(None),
        Organization.id == organization_id,
    ).first()
    if not org:
        return {}
    return org.settings or {}


def get_org_feature_flags(db: Session, organization_id: Optional[int]) -> Dict[str, bool]:
    """Return the organisation's feature toggles from Settings -> General.

    Defaults match the Settings page initial state.
    """
    general = (get_org_settings(db, organization_id) or {}).get("general") or {}
    return {
        "geoFence": general.get("geoFence", True),
        "selfService": general.get("selfService", True),
        "docUploads": general.get("docUploads", True),
        "multiCompany": general.get("multiCompany", False),
        # Auto-email on onboarding is OFF by default so we never burn the
        # SMTP quota without the admin explicitly enabling it.
        "autoEmails": general.get("autoEmails", False),
    }


def is_feature_enabled(
    db: Session,
    organization_id: Optional[int],
    feature: str,
) -> bool:
    """Check whether a single feature toggle is enabled (defaults to True)."""
    flags = get_org_feature_flags(db, organization_id)
    return bool(flags.get(feature, True))
