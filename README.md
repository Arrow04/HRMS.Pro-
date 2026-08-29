# HRMS Web Application

Enterprise Human Resource Management System with modules for Attendance, Leave, Payroll, Expenses, Recruitment, Performance Reviews, Asset Management, and Notifications.

## Tech Stack

- **Frontend**: React (TypeScript, Vite, Tailwind CSS)
- **Backend**: Python (FastAPI, SQLAlchemy)
- **Database**: PostgreSQL

## Setup

### Backend

```bash
cd hrms_backend
pip install -r requirements.txt
# Configure database connection in database.py / .env
uvicorn main:app --reload --port 8001
```

### Frontend

```bash
cd hrms_react_web
npm install
npm run dev
```

The Vite dev server proxies API requests to `http://localhost:8001`.

## Project Structure

```
hrms_backend/
  main.py              # All main API routes (~5200 lines)
  models.py            # SQLAlchemy models
  routers/             # Separated route modules
    auth.py            # Auth endpoints + get_current_user dependency
    employees.py       # Employee CRUD with pagination (~1200 lines)
    lookup.py          # Lookup dropdowns (12 endpoints)
    master_data.py     # Master data management (categories, values)
  core/                # Auth, caching utilities

hrms_react_web/
  src/
    pages/             # Page components (Attendance, Payroll, etc.)
    components/        # Shared components (AppHeader, ErrorBoundary, etc.)
    hooks/             # Custom React hooks
```

## Architecture Notes

- All models support soft-delete (`deleted_at` timestamp column)
- Auth via JWT tokens; all endpoints require authentication
- Role-based access control (employee, manager, hr_admin, admin, superadmin)
- Audit logging on all Attendance CRUD operations
- Notifications stored in DB with real-time polling from frontend
