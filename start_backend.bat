@echo off
cd /d D:\hrmsnew\hrms_backend
set PYTHONPATH=D:\hrmsnew\hrms_backend
set SEED_DEFAULT_USERS=true
C:\Users\sayak\AppData\Local\Python\pythoncore-3.14-64\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000 > D:\hrmsnew\hrms_backend\backend.log 2>&1
