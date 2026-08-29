@echo off
REM HRMS Python Backend Startup Script
REM This script activates the virtual environment and starts the FastAPI server

echo.
echo ========================================
echo   HRMS Python Backend Setup ^& Startup
echo ========================================
echo.

cd /d "%~dp0"

REM Activate virtualenv
if not exist "venv\Scripts\activate.bat" (
    echo ERROR: Virtual environment not found. Please create it first.
    pause
    exit /b 1
)

echo [1/2] Activating virtual environment...
call venv\Scripts\activate.bat

REM Check dependencies
echo [2/2] Starting uvicorn development server...
echo.
echo ========================================
echo   FastAPI backend starting on port 8000
echo ========================================
echo.
echo Swagger UI: http://localhost:8000/docs
echo Health Check: http://localhost:8000/health
echo.
echo Press Ctrl+C to stop the server
echo.

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

pause
