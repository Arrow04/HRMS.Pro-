"""Migrate all data from SQLite hrms_dev.db into PostgreSQL hrms_dev (fixed)."""
import sys
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker
import sqlite3

sys.path.insert(0, r"D:\hrmsnew\hrms_backend")

PG_URL = "postgresql+psycopg2://postgres:123456@localhost:5432/hrms_dev"
SQLITE_PATH = r"D:\hrmsnew\hrms_backend\hrms_dev.db"

import models  # noqa
from database import Base

pg_engine = create_engine(PG_URL, pool_pre_ping=True)
Base.metadata.create_all(bind=pg_engine)
print("Schema ensured on PostgreSQL")

pg_insp = inspect(pg_engine)
con_src = sqlite3.connect(SQLITE_PATH)
con_src.row_factory = sqlite3.Row
src_tables = [r[0] for r in con_src.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version'"
).fetchall()]

def coerce_value(val, is_bool=False, is_int=False, is_float=False, is_text=False):
    if val is None:
        return None
    if is_bool:
        if isinstance(val, str):
            return val.lower() in ("1", "true", "t", "yes", "y")
        return bool(val)
    if is_int:
        if isinstance(val, str):
            try:
                return int(float(val))
            except Exception:
                return None
        return int(val)
    if is_float:
        if isinstance(val, str):
            try:
                return float(val)
            except Exception:
                return None
        return float(val)
    if is_text:
        if isinstance(val, bytes):
            try:
                return val.decode("utf-8", errors="replace")
            except Exception:
                return None
        return val
    if isinstance(val, datetime) or isinstance(val, date):
        return val
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, bytes):
        try:
            return val.decode("utf-8", errors="replace")
        except Exception:
            return None
    return val

def pg_col_type(colinfo):
    t = str(colinfo.get("type") or "").lower()
    if "bool" in t:
        return "bool"
    if "int" in t or "serial" in t:
        return "int"
    if "float" in t or "numeric" in t or "decimal" in t or "real" in t or "double" in t:
        return "float"
    if "text" in t or "char" in t or "json" in t or "varchar" in t:
        return "text"
    return "text"

total_rows = 0
errors = []
conn = pg_engine.connect()
conn.execution_options(isolation_level="AUTOCOMMIT")
conn.execute(text("SET session_replication_role = replica"))

for table in src_tables:
    if not pg_insp.has_table(table):
        errors.append(f"{table}: missing on PG")
        continue
    pg_colinfo = {c["name"]: c for c in pg_insp.get_columns(table)}
    pg_cols = set(pg_colinfo.keys())
    src_cols = [d[1] for d in con_src.execute(f'PRAGMA table_info("{table}")').fetchall()]
    common = [c for c in src_cols if c in pg_cols]
    if not common:
        errors.append(f"{table}: no common columns ({len(src_cols)} src, {len(pg_cols)} pg)")
        continue

    col_kinds = {c: pg_col_type(pg_colinfo[c]) for c in common}

    rows = con_src.execute(f'SELECT * FROM "{table}"').fetchall()
    if not rows:
        continue

    col_list = ", ".join(f'"{c}"' for c in common)
    placeholders = ", ".join(f":{c}" for c in common)
    stmt = text(f'INSERT INTO "{table}" ({col_list}) VALUES ({placeholders})')

    # Truncate for re-runs
    try:
        conn.execute(text(f'DELETE FROM "{table}"'))
    except Exception:
        pass

    count = 0
    table_errors = 0
    for row in rows:
        payload = {}
        for c in common:
            kind = col_kinds[c]
            payload[c] = coerce_value(row[c], is_bool=kind == "bool", is_int=kind == "int", is_float=kind == "float", is_text=kind == "text")
        try:
            conn.execute(stmt, payload)
            count += 1
        except Exception as e:
            table_errors += 1
            if table_errors <= 3:
                errors.append(f"{table}: {str(e)[:150]}")
    total_rows += count
    print(f"  {table}: {count} rows ({table_errors} errors)")

conn.execute(text("SET session_replication_role = DEFAULT"))
conn.close()

print(f"\nDONE. {total_rows} total rows. {len(errors)} errors.")
for e in errors[:25]:
    print("  ERR:", e)
