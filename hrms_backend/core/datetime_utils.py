"""Timezone-aware datetime utilities for the HRMS backend.

Single source of truth: Organization.timezone (IANA tz string like 'Asia/Kolkata', 'Europe/London').
Falls back to DEFAULT_TIMEZONE env var, then IST for backward compatibility.

PostgreSQL stores naive datetimes — always strip tzinfo before saving.
"""
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# ── Country → IANA timezone mapping (single source of truth) ────────────────
COUNTRY_TIMEZONE_MAP = {
    "India": "Asia/Kolkata",
    "United States": "America/New_York",
    "United Kingdom": "Europe/London",
    "Australia": "Australia/Sydney",
    "United Arab Emirates": "Asia/Dubai",
    "Singapore": "Asia/Singapore",
    "Germany": "Europe/Berlin",
    "Canada": "America/Toronto",
    "Japan": "Asia/Tokyo",
    "France": "Europe/Paris",
    "China": "Asia/Shanghai",
    "Brazil": "America/Sao_Paulo",
    "South Africa": "Africa/Johannesburg",
    "Nigeria": "Africa/Lagos",
    "Egypt": "Africa/Cairo",
    "Saudi Arabia": "Asia/Riyadh",
    "Turkey": "Europe/Istanbul",
    "South Korea": "Asia/Seoul",
    "Mexico": "America/Mexico_City",
    "Indonesia": "Asia/Jakarta",
    "Thailand": "Asia/Bangkok",
    "Vietnam": "Asia/Ho_Chi_Minh",
    "Philippines": "Asia/Manila",
    "Malaysia": "Asia/Kuala_Lumpur",
    "New Zealand": "Pacific/Auckland",
    "Ireland": "Europe/Dublin",
    "Netherlands": "Europe/Amsterdam",
    "Switzerland": "Europe/Zurich",
    "Italy": "Europe/Rome",
    "Spain": "Europe/Madrid",
    "Russia": "Europe/Moscow",
    "Kenya": "Africa/Nairobi",
    "Ghana": "Africa/Accra",
    "Ethiopia": "Africa/Addis_Ababa",
    "Tanzania": "Africa/Dar_es_Salaam",
    "Uganda": "Africa/Kampala",
    "Pakistan": "Asia/Karachi",
    "Bangladesh": "Asia/Dhaka",
    "Sri Lanka": "Asia/Colombo",
    "Nepal": "Asia/Kathmandu",
    "UAE": "Asia/Dubai",
    "Kuwait": "Asia/Kuwait",
    "Qatar": "Asia/Qatar",
    "Bahrain": "Asia/Bahrain",
    "Oman": "Asia/Muscat",
    "Jordan": "Asia/Amman",
    "Lebanon": "Asia/Beirut",
    "Israel": "Asia/Jerusalem",
}

# ── Default timezone (env override, else IST for backward compat) ───────────
_DEFAULT_TZ_NAME = os.environ.get("DEFAULT_TIMEZONE", "Asia/Kolkata")

def _get_default_tz() -> ZoneInfo:
    return ZoneInfo(_DEFAULT_TZ_NAME)

# ── Helper: resolve timezone from org record or country name ────────────────

def get_timezone_for_country(country: str) -> ZoneInfo:
    """Return IANA ZoneInfo for a country name. Falls back to default."""
    tz_name = COUNTRY_TIMEZONE_MAP.get(country, _DEFAULT_TZ_NAME)
    return ZoneInfo(tz_name)

def get_org_timezone(org) -> ZoneInfo:
    """Given an Organization ORM object, return its ZoneInfo."""
    tz_name = getattr(org, "timezone", None) or _DEFAULT_TZ_NAME
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return _get_default_tz()

def get_org_tz_name(org) -> str:
    """Return the raw IANA tz string for an org."""
    return getattr(org, "timezone", None) or _DEFAULT_TZ_NAME

# ── Org-aware functions (preferred for new code) ────────────────────────────

def org_now(org) -> datetime:
    """Current time in the org's timezone (with tzinfo)."""
    return datetime.now(get_org_timezone(org))

def org_now_naive(org) -> datetime:
    """Current time in the org's timezone, naive (safe for DB storage)."""
    return org_now(org).replace(tzinfo=None)

def org_today(org):
    """Current date in the org's timezone."""
    return org_now(org).date()

def org_today_str(org):
    """Current date as 'YYYY-MM-DD' in the org's timezone."""
    return org_now(org).strftime("%Y-%m-%d")

def org_year(org):
    return org_now(org).year

def org_month(org):
    return org_now(org).month

def org_month_start(org):
    """First day of current month in the org's timezone (naive)."""
    now = org_now_naive(org)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

def org_month_start_str(org):
    return org_month_start(org).strftime("%Y-%m-%d")

def org_month_end_str(org):
    import calendar
    now = org_now_naive(org)
    last_day = calendar.monthrange(now.year, now.month)[1]
    return f"{now.year}-{now.month:02d}-{last_day}"

def org_isoformat(dt, org):
    """Format datetime as ISO string with the org's UTC offset appended."""
    if dt is None:
        return None
    s = dt.isoformat()
    if "+" in s or "Z" in s:
        return s
    tz = get_org_timezone(org)
    offset = datetime.now(tz).utcoffset()
    if offset is None:
        return s
    total_seconds = int(offset.total_seconds())
    hours, remainder = divmod(abs(total_seconds), 3600)
    minutes = remainder // 60
    sign = "+" if total_seconds >= 0 else "-"
    return s + f"{sign}{hours:02d}:{minutes:02d}"

# ── Backward-compatible IST functions (kept for existing callers) ───────────
# These use the default timezone so existing code keeps working.
# Over time, callers should migrate to org_* variants.

IST = ZoneInfo(_DEFAULT_TZ_NAME)

def _now_ist() -> datetime:
    return datetime.now(IST)

def ist_now():
    """Current default-tz time (with tzinfo)."""
    return _now_ist()

def ist_now_naive():
    """Current default-tz time as naive datetime. Safe for DB storage."""
    return _now_ist().replace(tzinfo=None)

def ist_today():
    return _now_ist().date()

def ist_today_str():
    return _now_ist().strftime("%Y-%m-%d")

def ist_year():
    return _now_ist().year

def ist_month():
    return _now_ist().month

def ist_month_start():
    now = ist_now_naive()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

def ist_month_start_str():
    return ist_month_start().strftime("%Y-%m-%d")

def ist_month_end_str():
    import calendar
    now = ist_now_naive()
    last_day = calendar.monthrange(now.year, now.month)[1]
    return f"{now.year}-{now.month:02d}-{last_day}"
