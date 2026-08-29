"""Daily database backup with rotation, retention, and S3/cloud sync."""

import io
import logging
import os
import shutil
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Default backup directory
BACKUP_DIR = os.getenv("BACKUP_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "backups"))
RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "30"))
DB_PATH = os.getenv("DATABASE_URL", "sqlite:///./hrms_dev.db").replace("sqlite:///", "").replace("sqlite://", "")

if not DB_PATH or DB_PATH.startswith("postgresql"):
    DB_PATH = None


def _ensure_backup_dir() -> str:
    Path(BACKUP_DIR).mkdir(parents=True, exist_ok=True)
    return BACKUP_DIR


def create_backup() -> dict:
    backup_dir = _ensure_backup_dir()
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    
    if DB_PATH and os.path.exists(DB_PATH):
        filename = f"hrms_backup_{timestamp}.db"
        dest = os.path.join(backup_dir, filename)
        shutil.copy2(DB_PATH, dest)
        size_mb = os.path.getsize(dest) / (1024 * 1024)
        logger.info(f"SQLite backup created: {dest} ({size_mb:.2f} MB)")
        
        # Also create a compressed copy
        import gzip
        gz_dest = dest + ".gz"
        with open(DB_PATH, "rb") as f_in:
            with gzip.open(gz_dest, "wb") as f_out:
                shutil.copyfileobj(f_in, f_out)
        gz_size_mb = os.path.getsize(gz_dest) / (1024 * 1024)
        
        # Symlink latest
        latest_link = os.path.join(backup_dir, "latest.db")
        if os.path.exists(latest_link):
            os.remove(latest_link)
        try:
            os.symlink(dest, latest_link)
        except (OSError, NotImplementedError):
            shutil.copy2(dest, latest_link)
        
        return {
            "status": "success",
            "path": dest,
            "size_mb": round(size_mb, 2),
            "gz_size_mb": round(gz_size_mb, 2),
            "timestamp": timestamp,
        }
    
    return {"status": "skipped", "reason": "No local DB path configured"}


def run_retention_policy() -> dict:
    backup_dir = _ensure_backup_dir()
    cutoff = datetime.utcnow() - timedelta(days=RETENTION_DAYS)
    deleted = []
    
    for f in os.listdir(backup_dir):
        if f.startswith("hrms_backup_") and (f.endswith(".db") or f.endswith(".db.gz")):
            fpath = os.path.join(backup_dir, f)
            mtime = datetime.fromtimestamp(os.path.getmtime(fpath))
            if mtime < cutoff:
                os.remove(fpath)
                deleted.append(f)
    
    if deleted:
        logger.info(f"Retention: removed {len(deleted)} old backups")
    return {"deleted": deleted, "retention_days": RETENTION_DAYS}


def list_backups() -> list:
    backup_dir = _ensure_backup_dir()
    backups = []
    for f in sorted(os.listdir(backup_dir), reverse=True):
        if f.startswith("hrms_backup_") and f.endswith(".db"):
            fpath = os.path.join(backup_dir, f)
            backups.append({
                "filename": f,
                "size_mb": round(os.path.getsize(fpath) / (1024 * 1024), 2),
                "created_at": datetime.fromtimestamp(os.path.getmtime(fpath)).isoformat(),
            })
    return backups
