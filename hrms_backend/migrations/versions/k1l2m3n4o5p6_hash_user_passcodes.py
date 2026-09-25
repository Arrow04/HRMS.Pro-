"""Hash stored user passcodes and widen the column.

Passcodes were stored in plaintext while login-passkey verifies them with
passlib, so passkey sign-in could never succeed. Widen users.passcode to hold
a hash and hash every existing plaintext value.

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-09-25
"""
import sqlalchemy as sa
from alembic import op

revision = 'k1l2m3n4o5p6'
down_revision = 'j0k1l2m3n4o5'
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        'users', 'passcode',
        existing_type=sa.String(length=10),
        type_=sa.String(length=255),
        existing_nullable=True,
    )
    from passlib.context import CryptContext
    ctx = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT id, passcode FROM users WHERE passcode IS NOT NULL AND passcode <> ''"
    )).fetchall()
    for user_id, passcode in rows:
        if not str(passcode).startswith('$'):
            conn.execute(
                sa.text("UPDATE users SET passcode = :pc WHERE id = :id"),
                {"pc": ctx.hash(str(passcode)), "id": user_id},
            )


def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("UPDATE users SET passcode = NULL WHERE passcode IS NOT NULL"))
    op.alter_column(
        'users', 'passcode',
        existing_type=sa.String(length=255),
        type_=sa.String(length=10),
        existing_nullable=True,
    )
