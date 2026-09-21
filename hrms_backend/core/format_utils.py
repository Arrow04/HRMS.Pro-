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

# ── Date format mapping (display format → strftime) ────────────────────────
DateFormatMap = {
    "YYYY-MM-DD": "%Y-%m-%d",
    "DD/MM/YYYY": "%d/%m/%Y",
    "MM/DD/YYYY": "%m/%d/%Y",
    "DD-MM-YYYY": "%d-%m-%Y",
    "DD.MM.YYYY": "%d.%m.%Y",
    "DD MMM YYYY": "%d %b %Y",
    "MMM DD, YYYY": "%b %d, %Y",
    "DD MMMM YYYY": "%d %B %Y",
}

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


def get_strftime(org=None) -> str:
    """Return the strftime pattern for the org's date_format setting.

    Defaults to '%Y-%m-%d' (ISO) if org is None or date_format not set.
    """
    fmt = None
    if org:
        fmt = getattr(org, "date_format", None)
    return DateFormatMap.get(fmt, "%Y-%m-%d") if fmt else "%Y-%m-%d"


def format_date(dt, org=None) -> str:
    """Format a datetime/date using the org's date_format setting.

    Falls back to ISO (%Y-%m-%d) if org is None.
    """
    if dt is None:
        return ""
    if isinstance(dt, datetime):
        return dt.strftime(get_strftime(org))
    # date object
    return dt.strftime(get_strftime(org))


def format_datetime(dt, org=None) -> str:
    """Format a datetime with both date and time using org settings.

    Time is always in HH:MM (24h). Date part follows org.date_format.
    """
    if dt is None:
        return ""
    pattern = get_strftime(org)
    # Append time
    return dt.strftime(pattern + " %H:%M")


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
