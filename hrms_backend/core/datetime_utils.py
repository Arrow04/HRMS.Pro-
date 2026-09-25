"""Timezone-aware datetime utilities for the HRMS backend.

Single source of truth: Organization.timezone (IANA tz string like 'Asia/Kolkata', 'Europe/London').
Falls back to DEFAULT_TIMEZONE env var, then IST for backward compatibility.

PostgreSQL stores naive datetimes — always strip tzinfo before saving.
"""
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# ── Country → IANA timezone mapping (single source of truth) ────────────────
# Mirrors hrms_react_web/src/utils/countryDefaults.ts — keep both in sync.
COUNTRY_TIMEZONE_MAP = {
    "Afghanistan": "Asia/Kabul",
    "Albania": "Europe/Tirane",
    "Algeria": "Africa/Algiers",
    "Andorra": "Europe/Andorra",
    "Angola": "Africa/Luanda",
    "Antigua and Barbuda": "America/Antigua",
    "Argentina": "America/Argentina/Buenos_Aires",
    "Armenia": "Asia/Yerevan",
    "Australia": "Australia/Sydney",
    "Austria": "Europe/Vienna",
    "Azerbaijan": "Asia/Baku",
    "Bahamas": "America/Nassau",
    "Bahrain": "Asia/Bahrain",
    "Bangladesh": "Asia/Dhaka",
    "Barbados": "America/Barbados",
    "Belarus": "Europe/Minsk",
    "Belgium": "Europe/Brussels",
    "Belize": "America/Belize",
    "Benin": "Africa/Porto-Novo",
    "Bhutan": "Asia/Thimphu",
    "Bolivia": "America/La_Paz",
    "Bosnia and Herzegovina": "Europe/Sarajevo",
    "Botswana": "Africa/Gaborone",
    "Brazil": "America/Sao_Paulo",
    "Brunei": "Asia/Brunei",
    "Bulgaria": "Europe/Sofia",
    "Burkina Faso": "Africa/Ouagadougou",
    "Burundi": "Africa/Bujumbura",
    "Cabo Verde": "Atlantic/Cape_Verde",
    "Cambodia": "Asia/Phnom_Penh",
    "Cameroon": "Africa/Douala",
    "Canada": "America/Toronto",
    "Central African Republic": "Africa/Bangui",
    "Chad": "Africa/Ndjamena",
    "Chile": "America/Santiago",
    "China": "Asia/Shanghai",
    "Colombia": "America/Bogota",
    "Comoros": "Indian/Comoro",
    "Congo (Brazzaville)": "Africa/Brazzaville",
    "Congo (DRC)": "Africa/Kinshasa",
    "Costa Rica": "America/Costa_Rica",
    "Côte d'Ivoire": "Africa/Abidjan",
    "Croatia": "Europe/Zagreb",
    "Cuba": "America/Havana",
    "Cyprus": "Europe/Nicosia",
    "Czechia": "Europe/Prague",
    "Denmark": "Europe/Copenhagen",
    "Djibouti": "Africa/Djibouti",
    "Dominica": "America/Dominica",
    "Dominican Republic": "America/Santo_Domingo",
    "Ecuador": "America/Guayaquil",
    "Egypt": "Africa/Cairo",
    "El Salvador": "America/El_Salvador",
    "Equatorial Guinea": "Africa/Malabo",
    "Eritrea": "Africa/Asmara",
    "Estonia": "Europe/Tallinn",
    "Eswatini": "Africa/Mbabane",
    "Ethiopia": "Africa/Addis_Ababa",
    "Fiji": "Pacific/Fiji",
    "Finland": "Europe/Helsinki",
    "France": "Europe/Paris",
    "Gabon": "Africa/Libreville",
    "Gambia": "Africa/Banjul",
    "Georgia": "Asia/Tbilisi",
    "Germany": "Europe/Berlin",
    "Ghana": "Africa/Accra",
    "Greece": "Europe/Athens",
    "Grenada": "America/Grenada",
    "Guatemala": "America/Guatemala",
    "Guinea": "Africa/Conakry",
    "Guinea-Bissau": "Africa/Bissau",
    "Guyana": "America/Guyana",
    "Haiti": "America/Port-au-Prince",
    "Honduras": "America/Tegucigalpa",
    "Hungary": "Europe/Budapest",
    "Iceland": "Atlantic/Reykjavik",
    "India": "Asia/Kolkata",
    "Indonesia": "Asia/Jakarta",
    "Iran": "Asia/Tehran",
    "Iraq": "Asia/Baghdad",
    "Ireland": "Europe/Dublin",
    "Israel": "Asia/Jerusalem",
    "Italy": "Europe/Rome",
    "Jamaica": "America/Jamaica",
    "Japan": "Asia/Tokyo",
    "Jordan": "Asia/Amman",
    "Kazakhstan": "Asia/Almaty",
    "Kenya": "Africa/Nairobi",
    "Kiribati": "Pacific/Tarawa",
    "Kosovo": "Europe/Belgrade",
    "Kuwait": "Asia/Kuwait",
    "Kyrgyzstan": "Asia/Bishkek",
    "Laos": "Asia/Vientiane",
    "Latvia": "Europe/Riga",
    "Lebanon": "Asia/Beirut",
    "Lesotho": "Africa/Maseru",
    "Liberia": "Africa/Monrovia",
    "Libya": "Africa/Tripoli",
    "Liechtenstein": "Europe/Vaduz",
    "Lithuania": "Europe/Vilnius",
    "Luxembourg": "Europe/Luxembourg",
    "Madagascar": "Indian/Antananarivo",
    "Malawi": "Africa/Blantyre",
    "Malaysia": "Asia/Kuala_Lumpur",
    "Maldives": "Indian/Male",
    "Mali": "Africa/Bamako",
    "Malta": "Europe/Malta",
    "Marshall Islands": "Pacific/Majuro",
    "Mauritania": "Africa/Nouakchott",
    "Mauritius": "Indian/Mauritius",
    "Mexico": "America/Mexico_City",
    "Micronesia": "Pacific/Pohnpei",
    "Moldova": "Europe/Chisinau",
    "Monaco": "Europe/Monaco",
    "Mongolia": "Asia/Ulaanbaatar",
    "Montenegro": "Europe/Podgorica",
    "Morocco": "Africa/Casablanca",
    "Mozambique": "Africa/Maputo",
    "Myanmar": "Asia/Yangon",
    "Namibia": "Africa/Windhoek",
    "Nauru": "Pacific/Nauru",
    "Nepal": "Asia/Kathmandu",
    "Netherlands": "Europe/Amsterdam",
    "New Zealand": "Pacific/Auckland",
    "Nicaragua": "America/Managua",
    "Niger": "Africa/Niamey",
    "Nigeria": "Africa/Lagos",
    "North Korea": "Asia/Pyongyang",
    "North Macedonia": "Europe/Skopje",
    "Norway": "Europe/Oslo",
    "Oman": "Asia/Muscat",
    "Pakistan": "Asia/Karachi",
    "Palau": "Pacific/Palau",
    "Palestine": "Asia/Hebron",
    "Panama": "America/Panama",
    "Papua New Guinea": "Pacific/Port_Moresby",
    "Paraguay": "America/Asuncion",
    "Peru": "America/Lima",
    "Philippines": "Asia/Manila",
    "Poland": "Europe/Warsaw",
    "Portugal": "Europe/Lisbon",
    "Qatar": "Asia/Qatar",
    "Romania": "Europe/Bucharest",
    "Russia": "Europe/Moscow",
    "Rwanda": "Africa/Kigali",
    "Saint Kitts and Nevis": "America/St_Kitts",
    "Saint Lucia": "America/St_Lucia",
    "Saint Vincent and the Grenadines": "America/St_Vincent",
    "Samoa": "Pacific/Apia",
    "San Marino": "Europe/San_Marino",
    "Sao Tome and Principe": "Africa/Sao_Tome",
    "Saudi Arabia": "Asia/Riyadh",
    "Senegal": "Africa/Dakar",
    "Serbia": "Europe/Belgrade",
    "Seychelles": "Indian/Mahe",
    "Sierra Leone": "Africa/Freetown",
    "Singapore": "Asia/Singapore",
    "Slovakia": "Europe/Bratislava",
    "Slovenia": "Europe/Ljubljana",
    "Solomon Islands": "Pacific/Guadalcanal",
    "Somalia": "Africa/Mogadishu",
    "South Africa": "Africa/Johannesburg",
    "South Korea": "Asia/Seoul",
    "South Sudan": "Africa/Juba",
    "Spain": "Europe/Madrid",
    "Sri Lanka": "Asia/Colombo",
    "Sudan": "Africa/Khartoum",
    "Suriname": "America/Paramaribo",
    "Sweden": "Europe/Stockholm",
    "Switzerland": "Europe/Zurich",
    "Syria": "Asia/Damascus",
    "Taiwan": "Asia/Taipei",
    "Tajikistan": "Asia/Dushanbe",
    "Tanzania": "Africa/Dar_es_Salaam",
    "Thailand": "Asia/Bangkok",
    "Timor-Leste": "Asia/Dili",
    "Togo": "Africa/Lome",
    "Tonga": "Pacific/Tongatapu",
    "Trinidad and Tobago": "America/Port_of_Spain",
    "Tunisia": "Africa/Tunis",
    "Turkey": "Europe/Istanbul",
    "Turkmenistan": "Asia/Ashgabat",
    "Tuvalu": "Pacific/Funafuti",
    "Uganda": "Africa/Kampala",
    "Ukraine": "Europe/Kyiv",
    "United Arab Emirates": "Asia/Dubai",
    "United Kingdom": "Europe/London",
    "United States": "America/New_York",
    "Uruguay": "America/Montevideo",
    "Uzbekistan": "Asia/Tashkent",
    "Vanuatu": "Pacific/Efate",
    "Vatican City": "Europe/Vatican",
    "Venezuela": "America/Caracas",
    "Vietnam": "Asia/Ho_Chi_Minh",
    "Yemen": "Asia/Aden",
    "Zambia": "Africa/Lusaka",
    "Zimbabwe": "Africa/Harare",
    # Common short aliases
    "USA": "America/New_York",
    "US": "America/New_York",
    "UK": "Europe/London",
    "UAE": "Asia/Dubai",
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
