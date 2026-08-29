"""
Attendance selfie storage — compress, partition by date, optional S3.

Mobile cameras often send 2–8 MB base64 payloads. We normalize every selfie to a
small progressive JPEG (~40–80 KB) so 60k punches/month stay in single-digit GB,
not hundreds of GB on disk.
"""
from __future__ import annotations

import base64
import io
import logging
import os
import time
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.config import settings

logger = logging.getLogger(__name__)

SELFIE_MAX_SIDE = int(os.getenv("SELFIE_MAX_SIDE", "640"))
SELFIE_JPEG_QUALITY = int(os.getenv("SELFIE_JPEG_QUALITY", "72"))
SELFIE_MAX_UPLOAD_BYTES = int(os.getenv("SELFIE_MAX_UPLOAD_BYTES", str(4 * 1024 * 1024)))
# 90 days = 3 months — check-in/out selfie files and DB URLs are purged after this.
SELFIE_RETENTION_DAYS = int(os.getenv("SELFIE_RETENTION_DAYS", "90"))
SELFIE_PURGE_INTERVAL_HOURS = int(os.getenv("SELFIE_PURGE_INTERVAL_HOURS", "24"))


def _uploads_root() -> str:
    """Same tree served by ``app.mount('/uploads', ...)`` in main.py."""
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), "routers", "uploads")


def _decode_base64_image(base64_data: str) -> Optional[bytes]:
    if not base64_data:
        return None
    raw = base64_data.strip()
    if "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw, validate=True)
    except Exception:
        try:
            return base64.b64decode(raw)
        except Exception:
            return None


def compress_selfie_bytes(image_bytes: bytes) -> Optional[bytes]:
    """Downscale + JPEG re-encode. Returns None if input is not a valid image."""
    if not image_bytes:
        return None
    if len(image_bytes) > SELFIE_MAX_UPLOAD_BYTES:
        logger.warning("Selfie upload rejected: %s bytes exceeds cap", len(image_bytes))
        return None
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes))
        img = img.convert("RGB")
        w, h = img.size
        max_side = SELFIE_MAX_SIDE
        if max(w, h) > max_side:
            ratio = max_side / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=SELFIE_JPEG_QUALITY, optimize=True, progressive=True)
        return buf.getvalue()
    except Exception as exc:
        logger.warning("Selfie compression failed: %s", exc)
        return None


def _relative_key(
    organization_id: Optional[int],
    employee_id: int,
    selfie_type: str,
    when: Optional[datetime] = None,
) -> tuple[str, str]:
    when = when or datetime.utcnow()
    org_part = str(organization_id or "0")
    date_path = when.strftime("%Y/%m/%d")
    filename = f"{employee_id}_{selfie_type}_{uuid.uuid4().hex[:10]}.jpg"
    rel = f"selfies/{org_part}/{date_path}/{filename}"
    return rel, filename


def _save_local(rel_path: str, content: bytes) -> str:
    full_path = os.path.join(_uploads_root(), rel_path.replace("/", os.sep))
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "wb") as f:
        f.write(content)
    return f"/uploads/{rel_path.replace(os.sep, '/')}"


def _save_s3(rel_path: str, content: bytes) -> Optional[str]:
    bucket = settings.AWS_S3_BUCKET
    if not bucket:
        return None
    try:
        import boto3
    except ImportError:
        logger.warning("boto3 not installed; storing selfie locally")
        return None
    try:
        client = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        )
        key = rel_path.replace("\\", "/")
        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=content,
            ContentType="image/jpeg",
            CacheControl="public, max-age=31536000, immutable",
        )
        prefix = os.getenv("S3_PUBLIC_URL_PREFIX", "").rstrip("/")
        if prefix:
            return f"{prefix}/{key}"
        return f"https://{bucket}.s3.{settings.AWS_REGION}.amazonaws.com/{key}"
    except Exception as exc:
        logger.error("S3 selfie upload failed: %s", exc)
        return None


def save_attendance_selfie(
    base64_data: str,
    employee_id: int,
    selfie_type: str = "checkin",
    organization_id: Optional[int] = None,
) -> Optional[str]:
    """
    Decode, compress, and store an attendance selfie.
    Returns a public URL path (local ``/uploads/...`` or S3/CDN URL).
    """
    raw = _decode_base64_image(base64_data)
    if not raw:
        return None
    compressed = compress_selfie_bytes(raw)
    if not compressed:
        return None

    rel_path, _ = _relative_key(organization_id, employee_id, selfie_type)
    s3_url = _save_s3(rel_path, compressed)
    if s3_url:
        return s3_url
    return _save_local(rel_path, compressed)


def purge_expired_selfies(retention_days: Optional[int] = None) -> int:
    """
    Delete local selfie folders older than retention (by yyyy/mm/dd path).
    S3 lifecycle rules should be configured separately in production.
    Returns count of deleted files.
    """
    retention_days = retention_days if retention_days is not None else SELFIE_RETENTION_DAYS
    if retention_days <= 0:
        return 0
    cutoff = datetime.utcnow().date() - timedelta(days=retention_days)
    root = os.path.join(_uploads_root(), "selfies")
    if not os.path.isdir(root):
        return 0

    deleted = 0
    for org_name in os.listdir(root):
        org_dir = os.path.join(root, org_name)
        if not os.path.isdir(org_dir):
            continue
        for year_name in os.listdir(org_dir):
            year_dir = os.path.join(org_dir, year_name)
            if not os.path.isdir(year_dir):
                continue
            try:
                year = int(year_name)
            except ValueError:
                continue
            for month_name in os.listdir(year_dir):
                month_dir = os.path.join(year_dir, month_name)
                if not os.path.isdir(month_dir):
                    continue
                try:
                    month = int(month_name)
                except ValueError:
                    continue
                for day_name in os.listdir(month_dir):
                    day_dir = os.path.join(month_dir, day_name)
                    if not os.path.isdir(day_dir):
                        continue
                    try:
                        day = int(day_name)
                        folder_date = datetime(year, month, day).date()
                    except ValueError:
                        continue
                    if folder_date >= cutoff:
                        continue
                    for fname in os.listdir(day_dir):
                        fpath = os.path.join(day_dir, fname)
                        if os.path.isfile(fpath):
                            try:
                                os.remove(fpath)
                                deleted += 1
                            except OSError:
                                pass
                    try:
                        os.rmdir(day_dir)
                    except OSError:
                        pass
    return deleted


def _purge_legacy_flat_selfies(retention_days: int) -> int:
    """Remove pre-partition flat .jpg files and old core/uploads/selfies copies."""
    cutoff_ts = time.time() - retention_days * 86400
    deleted = 0
    candidates = [
        os.path.join(_uploads_root(), "selfies"),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "core", "uploads", "selfies"),
    ]
    for directory in candidates:
        if not os.path.isdir(directory):
            continue
        for name in os.listdir(directory):
            path = os.path.join(directory, name)
            if not os.path.isfile(path) or not name.lower().endswith(".jpg"):
                continue
            try:
                if os.path.getmtime(path) < cutoff_ts:
                    os.remove(path)
                    deleted += 1
            except OSError:
                pass
    return deleted


def clear_expired_selfie_urls(db: Session, retention_days: Optional[int] = None) -> int:
    """Drop selfie URL references on attendance rows older than retention (records stay)."""
    from models import Attendance

    retention_days = retention_days if retention_days is not None else SELFIE_RETENTION_DAYS
    if retention_days <= 0:
        return 0
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    updated = (
        db.query(Attendance)
        .filter(
            Attendance.deleted_at.is_(None),
            Attendance.check_in.isnot(None),
            Attendance.check_in < cutoff,
            or_(
                Attendance.check_in_selfie_url.isnot(None),
                Attendance.check_out_selfie_url.isnot(None),
            ),
        )
        .update(
            {
                Attendance.check_in_selfie_url: None,
                Attendance.check_out_selfie_url: None,
            },
            synchronize_session=False,
        )
    )
    if updated:
        db.commit()
    return updated


def run_selfie_retention_job(db: Optional[Session] = None) -> Dict[str, Any]:
    """
    Delete expired check-in/out selfie files and clear stale URLs in the DB.
    Attendance punch records (times, status, hours) are kept.
    """
    retention_days = SELFIE_RETENTION_DAYS
    partitioned_deleted = purge_expired_selfies(retention_days)
    legacy_deleted = _purge_legacy_flat_selfies(retention_days)

    urls_cleared = 0
    own_session = db is None
    if own_session:
        from database import SessionLocal

        db = SessionLocal()
    try:
        urls_cleared = clear_expired_selfie_urls(db, retention_days)
    finally:
        if own_session and db is not None:
            db.close()

    result = {
        "retentionDays": retention_days,
        "filesDeleted": partitioned_deleted + legacy_deleted,
        "partitionedFilesDeleted": partitioned_deleted,
        "legacyFilesDeleted": legacy_deleted,
        "attendanceUrlsCleared": urls_cleared,
    }
    logger.info("Selfie retention job complete", extra=result)
    return result
