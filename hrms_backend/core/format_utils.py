"""Currency, date, and locale formatting utilities.

Single source of truth: Organization model fields:
  - default_currency (e.g. 'INR', 'USD', 'GBP')
  - date_format (e.g. 'YYYY-MM-DD', 'DD/MM/YYYY')
  - country (e.g. 'India', 'United Kingdom')
"""
from datetime import datetime

# ── Currency symbols ────────────────────────────────────────────────────────
CURRENCY_SYMBOLS = {
    "INR": "₹", "USD": "$", "GBP": "£", "EUR": "€", "AED": "د.إ",
    "SGD": "S$", "AUD": "A$", "CAD": "C$", "JPY": "¥", "CNY": "¥",
    "KRW": "₩", "BRL": "R$", "ZAR": "R", "NGN": "₦", "EGP": "E£",
    "SAR": "﷼", "QAR": "﷼", "KWD": "د.ك", "BHD": "BD", "OMR": "﷼",
    "JOD": "JD", "LBP": "L£", "TRY": "₺", "RUB": "₽", "PKR": "₨",
    "LKR": "Rs", "BDT": "৳", "NPR": "Rs", "THB": "฿", "VND": "₫",
    "PHP": "₱", "IDR": "Rp", "MYR": "RM", "NZD": "NZ$", "CHF": "CHF",
    "SEK": "kr", "NOK": "kr", "DKK": "kr", "PLN": "zł", "CZK": "Kč",
    "HUF": "Ft", "ILS": "₪", "KES": "KSh", "GHS": "GH₵", "ETB": "Br",
    "TZS": "TSh", "UGX": "USh", "MXP": "Mex$", "COP": "COL$", "ARS": "AR$",
    "CLP": "CL$", "PEN": "S/",
}

# ── Date format rendering (token-based, matches frontend countryDefaults) ──
# Supported tokens (longest match first): YYYY YY MMMM MMM MM M DD D EEEE EEE
# Everything else in the pattern is a literal separator.
_DATE_TOKENS = (
    ("YYYY", lambda dt: f"{dt.year:04d}"),
    ("YY", lambda dt: f"{dt.year % 100:02d}"),
    ("MMMM", lambda dt: dt.strftime("%B")),
    ("MMM", lambda dt: dt.strftime("%b")),
    ("EEEE", lambda dt: dt.strftime("%A")),
    ("EEE", lambda dt: dt.strftime("%a")),
    ("MM", lambda dt: f"{dt.month:02d}"),
    ("M", lambda dt: str(dt.month)),
    ("DD", lambda dt: f"{dt.day:02d}"),
    ("D", lambda dt: str(dt.day)),
)

DEFAULT_DATE_FORMAT = "YYYY-MM-DD"


def render_date(dt, pattern: str = DEFAULT_DATE_FORMAT) -> str:
    """Render a date/datetime with an org date_format pattern (e.g. 'DD MMM YYYY')."""
    if not pattern:
        pattern = DEFAULT_DATE_FORMAT
    for token, fn in _DATE_TOKENS:
        if token in pattern:
            pattern = pattern.replace(token, fn(dt))
    return pattern

# ── Public helpers ──────────────────────────────────────────────────────────

def currency_symbol(currency_code: str = "INR") -> str:
    """Return the display symbol for an ISO 4217 currency code."""
    return CURRENCY_SYMBOLS.get((currency_code or "INR").upper(), currency_code or "INR")


def format_currency(amount, currency_code: str = "INR", decimals: int = 0) -> str:
    """Format a numeric amount with the correct symbol and thousands separator.

    Example: format_currency(1234567.89, 'INR') → '₹12,34,568'
             format_currency(1234567.89, 'USD') → '$1,234,568'
    """
    sym = currency_symbol(currency_code)
    if amount is None:
        return f"{sym}0"
    try:
        val = float(amount)
    except (TypeError, ValueError):
        return f"{sym}{amount}"
    if decimals == 0:
        # Indian grouping for INR, standard western for others
        if (currency_code or "INR").upper() == "INR":
            return f"{sym}{_indian_grouping(round(val))}"
        return f"{sym}{val:,.{decimals}f}"
    return f"{sym}{val:,.{decimals}f}"


def _indian_grouping(n: float) -> str:
    """Format number with Indian grouping (lakhs/crores): 12,34,567."""
    negative = ""
    if n < 0:
        negative = "-"
        n = abs(n)
    s = str(int(n))
    if len(s) <= 3:
        return negative + s
    result = s[-3:]
    s = s[:-3]
    while s:
        result = s[-2:] + "," + result
        s = s[:-2]
    return negative + result


def get_date_format(org=None) -> str:
    """Return the org's date_format pattern, defaulting to ISO (YYYY-MM-DD)."""
    fmt = None
    if org:
        fmt = getattr(org, "date_format", None)
    return fmt or DEFAULT_DATE_FORMAT


# ── Time format rendering (tokens: HH H hh h mm ss A) ──────────────────────
DEFAULT_TIME_FORMAT = "HH:mm"

_TIME_TOKENS = (
    ("HH", lambda dt: f"{dt.hour:02d}"),
    ("hh", lambda dt: f"{((dt.hour + 11) % 12) + 1:02d}"),
    ("mm", lambda dt: f"{dt.minute:02d}"),
    ("ss", lambda dt: f"{dt.second:02d}"),
    ("A", lambda dt: "AM" if dt.hour < 12 else "PM"),
    ("H", lambda dt: str(dt.hour)),
    ("h", lambda dt: str(((dt.hour + 11) % 12) + 1)),
)


def render_time(dt, pattern: str = DEFAULT_TIME_FORMAT) -> str:
    """Render a time with an org time_format pattern (e.g. 'HH:mm' or 'hh:mm A')."""
    if not pattern:
        pattern = DEFAULT_TIME_FORMAT
    for token, fn in _TIME_TOKENS:
        if token in pattern:
            pattern = pattern.replace(token, fn(dt))
    return pattern


def get_time_format(org=None) -> str:
    """Return the org's time_format pattern, defaulting to 24h 'HH:mm'."""
    fmt = None
    if org:
        fmt = getattr(org, "time_format", None)
    return fmt or DEFAULT_TIME_FORMAT


def format_time(dt, org=None) -> str:
    """Format a time using the org's time_format setting."""
    if dt is None:
        return ""
    return render_time(dt, get_time_format(org))


def format_date(dt, org=None) -> str:
    """Format a datetime/date using the org's date_format setting.

    Falls back to ISO (YYYY-MM-DD) if org is None.
    """
    if dt is None:
        return ""
    return render_date(dt, get_date_format(org))


def format_datetime(dt, org=None) -> str:
    """Format a datetime with both date and time using org settings.

    Date follows org.date_format, time follows org.time_format.
    """
    if dt is None:
        return ""
    return f"{format_date(dt, org)} {format_time(dt, org)}"


def org_currency_code(org) -> str:
    """Get the currency code from org, with fallback."""
    if org:
        return getattr(org, "default_currency", None) or "INR"
    return "INR"


def org_country(org) -> str:
    """Get the country from org, with fallback."""
    if org:
        return getattr(org, "country", None) or "India"
    return "India"
