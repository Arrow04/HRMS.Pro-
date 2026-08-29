"""
Safe native-PostgreSQL partitioning migration for high-volume time-series
tables (attendances, payrolls, audit_logs).

Why this is a separate script and NOT run at startup:
- Converting an existing heap table to a partitioned one requires:
  1. create a partitioned table with identical columns
  2. COPY existing rows across
  3. drop the old table and rename the new one
  4. recreate indexes and FK constraints
- This is a locking, potentially long-running operation that must happen
  during a maintenance window with the app stopped or in low-traffic mode.

Run it explicitly (idempotent; safe to re-run):
    python -m migrate_partitions --table attendances --dry-run
    python -m migrate_partitions --table attendances

Only PostgreSQL is supported; other backends (SQLite) are skipped.
"""
import argparse
import sys

from sqlalchemy import text

from database import engine, DATABASE_URL


PARTITION_SPECS = {
    # table -> (partition column, granularity, make_interval / range func)
    # Partition bounds are expressed in months using date_trunc('month', ...).
    "attendances": {
        "column": "date",
        "months_back": 24,
        "months_forward": 12,
    },
    "audit_logs": {
        "column": "created_at",
        "months_back": 24,
        "months_forward": 12,
    },
}


def _is_postgres() -> bool:
    return DATABASE_URL.startswith("postgresql")


def _partitioned_table_name(table: str) -> str:
    return f"{table}_p"


def _create_partitioned_table(conn, table: str, spec: dict) -> None:
    col = spec["column"]
    base = f'{_partitioned_table_name(table)}_base'
    conn.execute(text(f"""
        CREATE TABLE IF NOT EXISTS {base} (
            LIKE {table} INCLUDING DEFAULTS INCLUDING CONSTRAINTS
        ) PARTITION BY RANGE ({col});
    """))


def _ensure_partitions(conn, table: str, spec: dict) -> None:
    from datetime import datetime, timedelta
    col = spec["column"]
    base = f'{_partitioned_table_name(table)}_base'
    start = datetime.utcnow().replace(day=1) - timedelta(days=30 * spec["months_back"])
    end = datetime.utcnow().replace(day=1) + timedelta(days=30 * spec["months_forward"])
    month = start
    while month < end:
        next_month = (month.replace(day=28) + timedelta(days=4)).replace(day=1)
        part_name = f"{table}_p_{month.strftime('%Y_%m')}"
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {part_name}
            PARTITION OF {base}
            FOR VALUES FROM ('{month.strftime('%Y-%m-%d')}')
                         TO ('{next_month.strftime('%Y-%m-%d')}');
        """))
        month = next_month


def _move_data_and_swap(conn, table: str, spec: dict, dry_run: bool) -> None:
    """Copy data into the partitioned table, drop the old table, and rename."""
    base = f'{_partitioned_table_name(table)}_base'
    final = _partitioned_table_name(table)

    # 1. Copy data (INSERT ... SELECT keeps column alignment by position).
    print(f"[{table}] Copying data -> {final} ...")
    conn.execute(text(f"INSERT INTO {final} SELECT * FROM {table};"))

    # 2. Recreate indexes (LIKE INCLUDING did not carry them over cleanly for
    #    partitioned tables; add the critical ones explicitly).
    conn.execute(text(f"CREATE INDEX IF NOT EXISTS {table}_p_org ON {final}(organization_id)"))
    conn.execute(text(f"CREATE INDEX IF NOT EXISTS {table}_p_emp ON {final}(employee_id)"))
    conn.execute(text(f"CREATE INDEX IF NOT EXISTS {table}_p_org_col ON {final}(organization_id, {spec['column']})"))

    # 3. Swap tables.
    if dry_run:
        print(f"[{table}] DRY RUN: would drop {table} and rename {final} -> {table}")
    else:
        conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
        conn.execute(text(f"ALTER TABLE {final} RENAME TO {table}"))
        print(f"[{table}] Swapped: {final} -> {table}")


def run(table: str, dry_run: bool = False) -> None:
    if not _is_postgres():
        print("Partitioning requires PostgreSQL. Skipping.")
        return
    if table not in PARTITION_SPECS:
        print(f"Unknown table '{table}'. Supported: {list(PARTITION_SPECS)}")
        sys.exit(2)

    spec = PARTITION_SPECS[table]
    with engine.connect() as conn:
        _create_partitioned_table(conn, table, spec)
        _ensure_partitions(conn, table, spec)
        if dry_run:
            print(f"[{table}] DRY RUN complete. No data moved.")
        else:
            _move_data_and_swap(conn, table, spec, dry_run=False)
        conn.commit()
    print(f"[{table}] Partitioning setup complete (dry_run={dry_run}).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Partition high-volume time-series tables.")
    parser.add_argument("--table", required=True, choices=list(PARTITION_SPECS))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    run(args.table, dry_run=args.dry_run)
