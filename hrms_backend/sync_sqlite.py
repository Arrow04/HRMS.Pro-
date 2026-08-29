"""Sync SQLite schema with SQLAlchemy models - add missing columns."""
import os, sys
os.environ.setdefault("DATABASE_URL", "sqlite:///D:/hrmsnew/hrms_backend/hrms_dev.db")
from database import engine
from sqlalchemy import text, inspect
import models

def py_type(col):
    import sqlalchemy
    m = {
        sqlalchemy.String: "VARCHAR",
        sqlalchemy.Integer: "INTEGER",
        sqlalchemy.Boolean: "BOOLEAN",
        sqlalchemy.DateTime: "TIMESTAMP",
        sqlalchemy.Float: "FLOAT",
        sqlalchemy.Text: "TEXT",
        sqlalchemy.JSON: "TEXT",
        sqlalchemy.Date: "DATE",
        sqlalchemy.BigInteger: "BIGINT",
        sqlalchemy.Numeric: "NUMERIC",
        sqlalchemy.LargeBinary: "BLOB",
    }
    for k, v in m.items():
        if isinstance(col.type, k):
            return v
    return "VARCHAR"

insp = inspect(engine)
added = 0
skipped = 0
with engine.begin() as conn:
    for name, model in models.Base.metadata.tables.items():
        if name.startswith("_") or not insp.has_table(name):
            continue
        existing = {c["name"] for c in insp.get_columns(name)}
        for col_name, col in model.columns.items():
            if col_name in existing:
                continue
            nullable = "" if col.nullable else " NOT NULL"
            default = ""
            if col.default is not None and getattr(col.default, "arg", None) is not None:
                arg = col.default.arg
                if isinstance(arg, bool):
                    default = f" DEFAULT {1 if arg else 0}"
                elif isinstance(arg, (int, float)):
                    default = f" DEFAULT {arg}"
                elif isinstance(arg, str):
                    default = f" DEFAULT '{arg}'"
            try:
                conn.execute(text(f"ALTER TABLE {name} ADD COLUMN {col_name} {py_type(col)}{nullable}{default}"))
                added += 1
                print(f"  Added {name}.{col_name}")
            except Exception as e:
                skipped += 1
                print(f"  SKIP {name}.{col_name}: {e}")
print(f"\nSchema sync complete: {added} added, {skipped} skipped")
