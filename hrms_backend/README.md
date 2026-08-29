# HRMS Backend (Python + PostgreSQL)

A FastAPI-based REST API backend for the HRMS application using PostgreSQL database.

## Features

- JWT-based authentication
- User management (Admin, Manager, Employee roles)
- Employee management
- Organization & Department management
- Leave management
- Attendance tracking
- Expense claims
- Payroll processing
- PostgreSQL database (production-ready)

## Prerequisites

- Python 3.8+
- PostgreSQL 12+

## Database Setup

1. Install PostgreSQL on your system
2. Create a database:
```sql
CREATE DATABASE hrms;
CREATE USER postgres WITH PASSWORD 'postgres';
GRANT ALL PRIVILEGES ON DATABASE hrms TO postgres;
```

## Application Setup

1. Create a virtual environment:
```bash
python -m venv venv
```

2. Activate the virtual environment:
```bash
# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create `.env` file:
```bash
cp .env.example .env
```

5. Update `.env` with your database credentials:
```
DATABASE_URL=postgresql://username:password@localhost:5432/hrms
```

6. Run the application:
```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The server will start at `http://localhost:8000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout user

### Employees
- `GET /api/employees` - Get all employees
- `GET /api/employees/<id>` - Get employee by ID
- `POST /api/employees` - Create employee
- `PUT /api/employees/<id>` - Update employee
- `DELETE /api/employees/<id>` - Deactivate employee

### Organizations
- `GET /api/organizations` - Get all organizations
- `GET /api/organizations/<id>` - Get organization by ID
- `POST /api/organizations` - Create organization

### Departments
- `GET /api/departments` - Get all departments
- `POST /api/departments` - Create department

### Leaves
- `GET /api/leaves` - Get leave applications
- `POST /api/leaves` - Apply for leave
- `POST /api/leaves/<id>/approve` - Approve/reject leave

### Attendance
- `GET /api/attendance` - Get attendance records
- `POST /api/attendance/checkin` - Check in
- `POST /api/attendance/checkout` - Check out

### Expenses
- `GET /api/expenses` - Get expense claims
- `POST /api/expenses` - Submit expense claim
- `POST /api/expenses/<id>/approve` - Approve/reject expense

### Payroll
- `GET /api/payroll` - Get payroll records
- `POST /api/payroll` - Create payroll record

## Default Admin Credentials

- Email: `admin@hrms.com`
- Password: `admin123`

**IMPORTANT:** Change these in production!

## Database Configuration

The application uses PostgreSQL by default. Update the `DATABASE_URL` in `.env`:

```
# PostgreSQL (default)
DATABASE_URL=postgresql://username:password@localhost:5432/hrms

# SQLite (for development only)
DATABASE_URL=sqlite:///hrms.db
```

## Production Deployment

1. Use a production ASGI server (uvicorn):
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

2. Set environment variables:
```bash
export JWT_SECRET_KEY=your-secure-random-key
```

3. Use HTTPS in production
4. Configure proper firewall rules
5. Set up database backups