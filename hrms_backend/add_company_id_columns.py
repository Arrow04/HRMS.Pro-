"""
Migration script: Add company_id column to 8 tables.

Run once:
    python add_company_id_columns.py
"""
from sqlalchemy import text
from database import engine

TABLES = [
    "salary_revisions",
    "salary_loans",
    "notifications",
    "assets",
    "investment_declarations",
    "employee_lifecycle_events",
    "onboarding_tasks",
    "anomaly_alerts",
]


def add_company_id_columns():
    with engine.begin() as conn:
        for table in TABLES:
            # Check if column already exists
            result = conn.execute(
                text(
                    f"SELECT COUNT(*) FROM information_schema.columns "
                    f"WHERE table_name = :table AND column_name = 'company_id'"
                ),
                {"table": table},
            )
            exists = result.scalar() > 0

            if exists:
                print(f"  [SKIP] {table}.company_id already exists")
                continue

            print(f"  [ADD]  {table}.company_id")
            conn.execute(
                text(
                    f"ALTER TABLE {table} "
                    f"ADD COLUMN company_id INTEGER REFERENCES companies(id) NULL"
                )
            )
            conn.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_{table}_company_id "
                    f"ON {table} (company_id)"
                )
            )

    print("Done.")


if __name__ == "__main__":
    print("Adding company_id column to tables...")
    add_company_id_columns()
