"""Sync database schema with SQLAlchemy models - add missing columns"""
from database import engine
from sqlalchemy import text
import models
import sqlalchemy

COLUMN_TYPE_MAP = {
    sqlalchemy.String: "VARCHAR(255)",
    sqlalchemy.Integer: "INTEGER",
    sqlalchemy.Boolean: "BOOLEAN",
    sqlalchemy.DateTime: "TIMESTAMP",
    sqlalchemy.Float: "FLOAT",
    sqlalchemy.Text: "TEXT",
    sqlalchemy.JSON: "JSON",
    sqlalchemy.Date: "DATE",
    sqlalchemy.BigInteger: "BIGINT",
    sqlalchemy.Numeric: "NUMERIC",
    sqlalchemy.LargeBinary: "BYTEA",
}

def get_pg_type(col):
    for py_type, pg_type in COLUMN_TYPE_MAP.items():
        if isinstance(col.type, py_type):
            return pg_type
    return "VARCHAR(255)"

with engine.connect() as conn:
    # Get all tables from models
    for name, model in models.Base.metadata.tables.items():
        if name.startswith("_") or name == "alembic_version":
            continue
        # Get existing columns in DB
        result = conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name=:t", 
        ), {"t": name})
        existing = {row[0] for row in result}
        
        for col_name, col in model.columns.items():
            if col_name not in existing:
                pg_type = get_pg_type(col)
                nullable = "NULL" if col.nullable else "NOT NULL"
                default = ""
                if col.default is not None and col.default.arg is not None:
                    if isinstance(col.default.arg, bool):
                        default = f" DEFAULT {'TRUE' if col.default.arg else 'FALSE'}"
                    elif isinstance(col.default.arg, (int, float)):
                        default = f" DEFAULT {col.default.arg}"
                    elif isinstance(col.default.arg, str):
                        default = f" DEFAULT '{col.default.arg}'"
                sql = f"ALTER TABLE {name} ADD COLUMN {col_name} {pg_type} {nullable}{default}"
                try:
                    conn.execute(text(sql))
                    conn.commit()
                    print(f"  Added {name}.{col_name} ({pg_type})")
                except Exception as e:
                    conn.rollback()
                    print(f"  FAILED {name}.{col_name}: {e}")
    
    print("Schema sync complete")
