import logging
import os
import uuid
from time import perf_counter

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import init_db


def _get_app_env() -> str:
    return os.getenv("APP_ENV", "development").lower()


def _configure_logging() -> logging.Logger:
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format="%(asctime)s %(levelname)s [%(name)s] [%(request_id)s] %(message)s",
    )

    class RequestIdFilter(logging.Filter):
        def filter(self, record):
            record.request_id = getattr(record, "request_id", "-")
            return True

    for handler in logging.getLogger().handlers:
        handler.addFilter(RequestIdFilter())

    return logging.getLogger("hrms")


def configure_runtime(app: FastAPI) -> None:
    app_env = _get_app_env()
    secret_key = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
    run_db_init = os.getenv("RUN_DB_INIT", "true").lower() == "true"
    logger = _configure_logging()

    if app_env == "production" and secret_key == "your-secret-key-change-in-production":
        raise RuntimeError("JWT_SECRET_KEY must be set in production")

    cors_origins_raw = os.getenv("CORS_ORIGINS", os.getenv("CORS_ALLOW_ORIGINS", "*"))
    cors_allow_origins = [origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_allow_origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def startup_event():
        if run_db_init:
            logger.info("Initializing database on startup", extra={"request_id": "startup"})
            init_db()
        else:
            logger.info("Skipping database initialization on startup", extra={"request_id": "startup"})

    @app.middleware("http")
    async def add_request_context(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        started_at = perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled request error %s %s",
                request.method,
                request.url.path,
                extra={"request_id": request_id},
            )
            raise

        elapsed_ms = round((perf_counter() - started_at) * 1000, 2)
        logger.info(
            "%s %s -> %s (%.2f ms)",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            extra={"request_id": request_id},
        )
        response.headers["X-Request-ID"] = request_id
        return response

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        request_id = request.headers.get("X-Request-ID", "-")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "message": exc.detail,
                    "status_code": exc.status_code,
                    "request_id": request_id,
                }
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        request_id = request.headers.get("X-Request-ID", "-")
        logger.exception("Unhandled application error", extra={"request_id": request_id})
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "message": "Internal server error",
                    "status_code": 500,
                    "request_id": request_id,
                }
            },
        )

    @app.get("/")
    def hello_world():
        return {"message": "Hello, World!"}

    @app.get("/healthz")
    def health_check():
        return {"status": "ok", "environment": app_env}
