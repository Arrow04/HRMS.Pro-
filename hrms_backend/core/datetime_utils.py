"""Shared IST datetime utilities for the HRMS backend.

All date/time operations should use IST (UTC+5:30) since the user is in India.
PostgreSQL stores naive datetimes — always strip tzinfo before saving.
"""
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))


def ist_now():
    """Current IST time (with tzinfo)."""
    return datetime.now(IST)


def ist_now_naive():
    """Current IST time as naive datetime (tzinfo stripped). Safe for DB storage."""
    return datetime.now(IST).replace(tzinfo=None)


def ist_today():
    """Current IST date."""
    return ist_now().date()


def ist_today_str():
    """Current IST date as 'YYYY-MM-DD' string."""
    return ist_now().strftime("%Y-%m-%d")


def ist_year():
    """Current IST year."""
    return ist_now().year


def ist_month():
    """Current IST month."""
    return ist_now().month


def ist_month_start():
    """First day of current IST month as naive datetime."""
    now = ist_now_naive()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def ist_month_start_str():
    """First day of current IST month as 'YYYY-MM-DD'."""
    return ist_month_start().strftime("%Y-%m-%d")


def ist_month_end_str():
    """Last day of current IST month as 'YYYY-MM-DD'."""
    import calendar
    now = ist_now_naive()
    last_day = calendar.monthrange(now.year, now.month)[1]
    return f"{now.year}-{now.month:02d}-{last_day}"
