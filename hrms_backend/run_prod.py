#!/usr/bin/env python3
"""Production entry point for HRMS Enterprise API.

Usage:
    python run_prod.py

Runs uvicorn with multiple workers, no reload, on 0.0.0.0:PORT.
Set PORT env var (default 8000), WORKERS env var (default 4).
"""
import os
import uvicorn

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    workers = int(os.getenv("WORKERS", "4"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        workers=workers,
        reload=False,
        log_level=os.getenv("LOG_LEVEL", "info").lower(),
    )
