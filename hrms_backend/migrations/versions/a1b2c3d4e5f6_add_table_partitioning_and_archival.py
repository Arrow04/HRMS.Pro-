"""add_table_partitioning_and_archival

Revision ID: a1b2c3d4e5f6
Revises: 4297889670de
Create Date: 2026-09-08 03:54:00.000000

"""
from typing import Sequence, Union
from datetime import date
from calendar import monthrange

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '4297889670de'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ensure_extension(conn, name: str):
    try:
        conn.execute(sa.text(f"CREATE EXTENSION IF NOT EXISTS {name}"))
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise RuntimeError(f"Extension {name} required but unavailable: {exc}") from exc


def _partition_exists(conn, table_name: str) -> bool:
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = :t)"
        ),
        {"t": table_name},
    )
    return result.scalar() is True


def _index_exists(conn, index_name: str) -> bool:
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM pg_indexes WHERE schemaname = 'public' AND indexname = :i)"
        ),
        {"i": index_name},
    )
    return result.scalar() is True


def _column_exists(conn, table: str, column: str) -> bool:
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = :t AND column_name = :c)"
        ),
        {"t": table, "c": column},
    )
    return result.scalar() is True


def _convert_to_partitioned(conn, table: str, partition_by: str, indexes: list):
    old_table = f"{table}_old"
    new_table = f"{table}_new"

    if not _partition_exists(conn, table):
        return

    try:
        conn.execute(sa.text(f"ALTER TABLE IF EXISTS {table} RENAME TO {old_table}"))
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise RuntimeError(f"Failed to rename {table}: {exc}") from exc

    try:
        conn.execute(
            sa.text(
                f"CREATE TABLE {new_table} (LIKE {old_table} INCLUDING ALL) "
                f"PARTITION BY {partition_by}"
            )
        )
        conn.commit()
    except Exception as exc:
        conn.rollback()
        conn.execute(sa.text(f"ALTER TABLE IF EXISTS {old_table} RENAME TO {table}"))
        conn.commit()
        raise RuntimeError(f"Failed to create partitioned {new_table}: {exc}") from exc

    try:
        conn.execute(sa.text(f"INSERT INTO {new_table} SELECT * FROM {old_table}"))
        conn.commit()
    except Exception as exc:
        conn.rollback()
        conn.execute(sa.text(f"DROP TABLE IF EXISTS {new_table}"))
        conn.execute(sa.text(f"ALTER TABLE IF EXISTS {old_table} RENAME TO {table}"))
        conn.commit()
        raise RuntimeError(f"Failed to copy data to {new_table}: {exc}") from exc

    try:
        conn.execute(sa.text(f"DROP TABLE {old_table}"))
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise RuntimeError(f"Failed to drop old table {old_table}: {exc}") from exc

    try:
        conn.execute(sa.text(f"ALTER TABLE {new_table} RENAME TO {table}"))
        conn.commit()
    except Exception as exc:
        conn.rollback()
        raise RuntimeError(f"Failed to rename {new_table} to {table}: {exc}") from exc

    for idx_sql in indexes:
        try:
            conn.execute(sa.text(idx_sql))
            conn.commit()
        except Exception as exc:
            conn.rollback()
            raise RuntimeError(f"Failed to create index on {table}: {exc}") from exc


def _unpartition_table(conn, table: str):
    try:
        result = conn.execute(
            sa.text(
                "SELECT inhrelid::regclass FROM pg_inherits "
                "WHERE inhparent = :t::regclass"
            ),
            {"t": table},
        )
        partitions = [row[0] for row in result.fetchall()]
    except Exception:
        partitions = []

    for partition in partitions:
        try:
            conn.execute(sa.text(f"ALTER TABLE {table} DETACH PARTITION {partition}"))
            conn.execute(sa.text(f"DROP TABLE {partition}"))
            conn.commit()
        except Exception:
            pass

    try:
        conn.execute(sa.text(f"DROP TABLE IF EXISTS {table}"))
        conn.commit()
    except Exception:
        conn.rollback()

    old_table = f"{table}_old"
    try:
        conn.execute(sa.text(f"ALTER TABLE IF EXISTS {old_table} RENAME TO {table}"))
        conn.commit()
    except Exception:
        conn.rollback()


def upgrade() -> None:
    _ensure_extension(op.get_bind(), "pg_trgm")

    conn = op.get_bind()

    # ------------------------------------------------------------------
    # 1. Archive tables
    # ------------------------------------------------------------------
    archive_tables = [
        ("attendance_archive", """
            CREATE TABLE IF NOT EXISTS attendance_archive (
                LIKE attendances INCLUDING ALL
            )
        """),
        ("payroll_archive", """
            CREATE TABLE IF NOT EXISTS payroll_archive (
                LIKE payrolls INCLUDING ALL
            )
        """),
        ("notification_archive", """
            CREATE TABLE IF NOT EXISTS notification_archive (
                LIKE notifications INCLUDING ALL
            )
        """),
        ("audit_log_archive", """
            CREATE TABLE IF NOT EXISTS audit_log_archive (
                LIKE audit_logs INCLUDING ALL
            )
        """),
        ("leave_application_archive", """
            CREATE TABLE IF NOT EXISTS leave_application_archive (
                LIKE leave_applications INCLUDING ALL
            )
        """),
    ]

    for table_name, create_sql in archive_tables:
        if not _partition_exists(conn, table_name):
            try:
                conn.execute(sa.text(create_sql))
                conn.commit()
            except Exception as exc:
                conn.rollback()
                raise RuntimeError(f"Failed to create archive table {table_name}: {exc}") from exc

    # ------------------------------------------------------------------
    # 2. Add missing organization_id to notifications
    # ------------------------------------------------------------------
    if not _column_exists(conn, "notifications", "organization_id"):
        try:
            with op.batch_alter_table("notifications", schema=None) as batch_op:
                batch_op.add_column(sa.Column("organization_id", sa.Integer(), nullable=True))
                batch_op.create_index("ix_notifications_organization_id", ["organization_id"], unique=False)
            conn.commit()
        except Exception as exc:
            conn.rollback()
            raise RuntimeError(f"Failed to add organization_id to notifications: {exc}") from exc

    # ------------------------------------------------------------------
    # 3. Convert tables to partitioned
    # ------------------------------------------------------------------
    _convert_to_partitioned(
        conn,
        table="attendances",
        partition_by="RANGE (date)",
        indexes=[
            "CREATE INDEX IF NOT EXISTS idx_att_org_date ON attendances(organization_id, date)",
            "CREATE INDEX IF NOT EXISTS idx_att_emp_date ON attendances(employee_id, date)",
            "CREATE INDEX IF NOT EXISTS idx_att_company_date ON attendances(company_id, date)",
            "CREATE INDEX IF NOT EXISTS idx_att_org_emp_date ON attendances(organization_id, employee_id, date)",
            "CREATE INDEX IF NOT EXISTS idx_att_org_status_date ON attendances(organization_id, status, date)",
            "CREATE INDEX IF NOT EXISTS idx_att_org_status ON attendances(organization_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_att_emp_open ON attendances(employee_id) WHERE check_out IS NULL AND deleted_at IS NULL",
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_att_emp_open_session ON attendances(employee_id) WHERE check_out IS NULL AND deleted_at IS NULL",
        ],
    )

    _convert_to_partitioned(
        conn,
        table="payrolls",
        partition_by="RANGE (created_at)",
        indexes=[
            "CREATE INDEX IF NOT EXISTS idx_pay_org_period ON payrolls(organization_id, year, month)",
            "CREATE INDEX IF NOT EXISTS idx_pay_emp_period ON payrolls(employee_id, year, month)",
            "CREATE INDEX IF NOT EXISTS idx_pay_company_period ON payrolls(company_id, year, month)",
            "CREATE INDEX IF NOT EXISTS idx_pay_org_status_period ON payrolls(organization_id, status, year, month)",
        ],
    )

    _convert_to_partitioned(
        conn,
        table="notifications",
        partition_by="RANGE (created_at)",
        indexes=[
            "CREATE INDEX IF NOT EXISTS idx_notif_user_created ON notifications(user_id, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, is_read)",
            "CREATE INDEX IF NOT EXISTS ix_notifications_organization_id ON notifications(organization_id)",
        ],
    )

    _convert_to_partitioned(
        conn,
        table="audit_logs",
        partition_by="RANGE (created_at)",
        indexes=[
            "CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs(organization_id, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_audit_module_created ON audit_logs(module, created_at)",
        ],
    )

    _convert_to_partitioned(
        conn,
        table="leave_applications",
        partition_by="RANGE (created_at)",
        indexes=[
            "CREATE INDEX IF NOT EXISTS idx_leave_org_status ON leave_applications(organization_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_leave_emp_start ON leave_applications(employee_id, start_date)",
            "CREATE INDEX IF NOT EXISTS idx_leave_org_start ON leave_applications(organization_id, start_date)",
            "CREATE INDEX IF NOT EXISTS idx_leave_org_emp_status ON leave_applications(organization_id, employee_id, status)",
        ],
    )

    # ------------------------------------------------------------------
    # 4. Create monthly partitions for current and next 2 years
    # ------------------------------------------------------------------
    today = date.today()
    start_year = today.year
    end_year = today.year + 2

    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            last_day = monthrange(year, month)[1]
            from_date = f"{year:04d}-{month:02d}-01"
            if month == 12:
                to_date = f"{year + 1:04d}-01-01"
            else:
                to_date = f"{year:04d}-{month + 1:02d}-01"

            tables = ["attendances", "payrolls", "notifications", "audit_logs", "leave_applications"]
            for table in tables:
                partition_name = f"{table}_y{year}m{month:02d}"
                if not _partition_exists(conn, partition_name):
                    try:
                        conn.execute(
                            sa.text(
                                f"CREATE TABLE IF NOT EXISTS {partition_name} "
                                f"PARTITION OF {table} "
                                f"FOR VALUES FROM ('{from_date}') TO ('{to_date}')"
                            )
                        )
                        conn.commit()
                    except Exception as exc:
                        conn.rollback()
                        raise RuntimeError(f"Failed to create partition {partition_name}: {exc}") from exc

    # ------------------------------------------------------------------
    # 5. Create default partitions for out-of-range data
    # ------------------------------------------------------------------
    for table in ["attendances", "payrolls", "notifications", "audit_logs", "leave_applications"]:
        default_name = f"{table}_default"
        if not _partition_exists(conn, default_name):
            try:
                conn.execute(sa.text(f"CREATE TABLE IF NOT EXISTS {default_name} PARTITION OF {table} DEFAULT"))
                conn.commit()
            except Exception as exc:
                conn.rollback()
                raise RuntimeError(f"Failed to create default partition {default_name}: {exc}") from exc


def downgrade() -> None:
    conn = op.get_bind()

    tables_to_unpartition = ["leave_applications", "audit_logs", "notifications", "payrolls", "attendances"]
    for table in tables_to_unpartition:
        _unpartition_table(conn, table)

    conn.execute(sa.text("DROP TABLE IF EXISTS attendance_archive CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS payroll_archive CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS notification_archive CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS audit_log_archive CASCADE"))
    conn.execute(sa.text("DROP TABLE IF EXISTS leave_application_archive CASCADE"))
    conn.commit()

    if _column_exists(conn, "notifications", "organization_id"):
        try:
            with op.batch_alter_table("notifications", schema=None) as batch_op:
                batch_op.drop_index("ix_notifications_organization_id")
                batch_op.drop_column(sa.Column("organization_id", sa.Integer(), nullable=True))
            conn.commit()
        except Exception:
            conn.rollback()
