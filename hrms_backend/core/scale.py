"""Scale constants — single source of truth for list/pagination limits."""
import os

# Default page size for employee and transaction lists
DEFAULT_LIST_LIMIT = 50

# Hard cap for open-ended list browsing (employees, unfiltered grids)
MAX_LIST_LIMIT = 100

# Period-scoped business queries (payroll month, attendance range) — one row per employee max
MAX_PERIOD_LIST_LIMIT = int(os.getenv("MAX_PERIOD_LIST_LIMIT", "1000000"))

# Employee picker — no practical cap (700 or 700k); paginate in pages of PICKER_PAGE_SIZE
MAX_PICKER_LIMIT = int(os.getenv("MAX_PICKER_LIMIT", "1000000"))
PICKER_PAGE_SIZE = int(os.getenv("PICKER_PAGE_SIZE", "5000"))

# Bulk export endpoints only
MAX_EXPORT_LIMIT = 5000
