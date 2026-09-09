# HRMS.Pro! — Enterprise Human Resource Management System

## 1. Project Overview

HRMS.Pro! is a multi-tenant, enterprise-grade Human Resource Management System designed for Indian enterprises. It provides end-to-end HR automation including employee lifecycle management, attendance, payroll, leave management, recruitment, performance reviews, expenses, AI automation, and a control hub for tenant/superadmin operations.

The project is organized as a monorepo containing four distinct modules:

| Module | Purpose | Port |
|---|---|---|
| `hrms_backend` | FastAPI backend API + AI engine | 8000 |
| `hrms_react_web` | Employee / Admin web portal | 5173 |
| `hrms_mobile` | React Native / Expo mobile app | Expo client |
| `hrms_tenant_hub` | Superadmin control hub | 3001 |

---

## 2. Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Nginx / CDN                         │
└───────────────┬──────────────────────┬──────────────────────┘
                │                      │
     ┌──────────▼──────────┐  ┌──────▼──────────────┐
     │  hrms_react_web     │  │  hrms_tenant_hub    │
     │  (Vite + React)     │  │  (Vite + React)     │
     └──────────┬──────────┘  └──────┬──────────────┘
                │                    │
                └──────────┬─────────┘
                           │ HTTPS / REST + JWT
                   ┌───────▼────────┐
                   │   Nginx LB     │
                   └───────┬────────┘
                           │
              ┌────────────▼────────────────────┐
              │     hrms_backend (FastAPI)      │
              │  - Routers / Controllers        │
              │  - Services / Core utilities    │
              │  - AI Engine / AI Service       │
              └────────────┬────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
     ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
     │ PostgreSQL │   │   Redis   │   │  S3 / FS  │
     │   (Primary)│   │  Cache    │   │  Uploads  │
     └────────────┘   └───────────┘   └───────────┘
```

### 2.2 Module Boundaries

#### `hrms_backend`
- Single FastAPI application entrypoint: `main.py`
- SQLAlchemy ORM models in `models.py`
- Database initialization in `database.py`
- Route routers under `routers/`
- Controllers under `controllers/`
- Business logic under `services/`
- Core utilities under `core/` (auth, cache, middleware, permissions, tenant, validation)
- AI capabilities under `ai_engine.py` and `ai_service.py`
- Alembic migrations under `migrations/`
- Test suite under `tests/`
- Static uploads under `routers/uploads/`

#### `hrms_react_web`
- Vite + React 19 + TypeScript frontend
- Tailwind CSS styling
- TanStack Query for server state
- React Router for navigation
- ag-Grid for data tables
- Chart.js / Recharts for analytics
- PDF export via jsPDF

#### `hrms_mobile`
- Expo / React Native application
- Screens, components, hooks, services, utils, types
- Offline sync, push notifications, selfie capture

#### `hrms_tenant_hub`
- Lightweight Vite + React + TypeScript app
- Superadmin dashboard for tenant management, billing, feature flags, system health

---

## 3. Tech Stack

### 3.1 Backend (`hrms_backend`)

| Layer | Technology |
|---|---|
| Framework | FastAPI 0.136.3 |
| Server | Uvicorn 0.49.0 |
| ORM | SQLAlchemy 2.0.49 |
| Database | PostgreSQL 15+ (with SQLite fallback for dev) |
| Cache | Redis 7 |
| Auth | JWT (`python-jose` + `PyJWT`) + bcrypt |
| Validation | Pydantic 2.13.3 |
| Migrations | Alembic 1.18.3 |
| Logging | structlog + python-json-logger |
| AI/OCR | EasyOCR, PyMuPDF, pypdf |
| File handling | Pillow, boto3 (S3) |
| Deployment | Docker Compose, Nginx, Render (`render.yaml`, `fly.toml`) |

### 3.2 Web Frontend (`hrms_react_web`)

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS 3.4 + PostCSS |
| State | TanStack React Query 5 |
| Routing | React Router 7 |
| Tables | AG Grid Community 36 |
| Charts | Chart.js 4 + Recharts 3 |
| PDF | jsPDF + jsPDF-AutoTable |
| Utils | date-fns, xlsx, lucide-react |
| Testing | Vitest 4 + Testing Library |

### 3.3 Mobile (`hrms_mobile`)

| Layer | Technology |
|---|---|
| Framework | React Native via Expo |
| Language | JavaScript / TypeScript |
| Navigation | React Navigation |
| State | Zustand + Context API |
| Offline | Custom offline sync queue |
| Media | Expo Image Picker, Camera |
| Push | Expo Notifications |
| Crash reporting | Sentry |
| Build | EAS Build |

### 3.4 Tenant Hub (`hrms_tenant_hub`)

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite |
| Styling | Tailwind CSS |
| State | TanStack React Query |
| Routing | React Router |

---

## 4. Environment Configuration

### 4.1 Backend (`.env`)

Key variables (see `hrms_backend/.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_ENV` | `development` / `production` |
| `JWT_SECRET_KEY` | JWT signing secret |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token TTL |
| `REDIS_URL` | Redis connection |
| `SMTP_*` | Gmail SMTP for emails |
| `CORS_ORIGINS` | Allowed web origins |
| `ENABLE_RATE_LIMITING` | API rate limiting toggle |
| `SENTRY_DSN` | Crash reporting |

### 4.2 Web Frontend

Uses Vite env variables (`VITE_*`). Configure API base URL and feature flags in `.env` or build-time config.

### 4.3 Mobile

Uses Expo public env variables (`EXPO_PUBLIC_*`). Example:
- `EXPO_PUBLIC_API_URL` — backend API base URL

### 4.4 Tenant Hub

Vite env variables. Runs on port 3001 by default.

---

## 5. Database Schema (Key Entities)

The backend defines 30+ SQLAlchemy models. Core entities include:

| Entity | Description |
|---|---|
| `User` | Authentication accounts |
| `Organization` | Top-level tenant |
| `Company` | Companies under org |
| `Department` / `Branch` / `Designation` | Org structure |
| `Employee` | Employee master linked to User |
| `Attendance` | Daily attendance / punches |
| `LeaveType` / `LeaveBalance` / `LeaveApplication` | Leave management |
| `Payroll` / `PayrollPolicy` / `SalaryTemplate` | Payroll processing |
| `Expense` | Employee expenses |
| `Asset` | Company asset tracking |
| `JobOpening` / `Candidate` / `Interview` | Recruitment pipeline |
| `PerformanceReview` / `Goal` | Performance management |
| `Holiday` / `Shift` | Time & attendance policies |
| `Notification` | In-app notifications |
| `AuditLog` | Compliance audit trail |
| `ExitRecord` / `ArchivedEmployee` | Employee exit workflow |

Multi-tenancy is enforced at the row level via `organization_id` scoping and helper utilities in `core/employee_scope.py`.

---

## 6. Key Features

### 6.1 Employee Self-Service
- Attendance with selfie verification
- Leave request / balance tracking
- Expense submission
- Payslip download
- Profile management
- Document upload

### 6.2 Admin / HR
- Employee lifecycle (onboarding to exit)
- Attendance policies and correction
- Payroll processing with statutory compliance (PF, ESI, NPS, LWF, tax regimes)
- Recruitment pipeline
- Performance reviews and goals
- Asset management
- Announcements and notifications
- Reports and exports

### 6.3 AI & Automation
- AI chatbot for HR queries
- Anomaly detection in attendance/payroll
- Document parsing (resume, invoices)
- Automation pipeline for workflows

### 6.4 Superadmin / Control Hub
- Tenant management
- Billing and subscriptions
- Feature flags
- System health monitoring
- Audit log viewer

---

## 7. Local Development Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose

### Backend
```bash
cd hrms_backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with local DB credentials
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Web Frontend
```bash
cd hrms_react_web
npm install
npm run dev
```

### Mobile
```bash
cd hrms_mobile
npm install
npx expo start
```

### Tenant Hub
```bash
cd hrms_tenant_hub
npm install
npm run dev
```

### Docker Compose (Full Stack)
```bash
cd hrms_backend
docker-compose up --build
```

---

## 8. Production Deployment

### Backend
- Dockerfile present in `hrms_backend/`
- `docker-compose.prod.yml` for production stack
- Render deployment config in `render.yaml`
- Fly.io deployment config in `fly.toml`
- Monitoring: Prometheus + Grafana
- Load balancing: Nginx with 3 API replicas

### Frontends
- `hrms_react_web`: Dockerfile + nginx.conf + Vercel / Netlify configs
- `hrms_tenant_hub`: Dockerfile + nginx.conf + Vercel / Netlify configs
- `hrms_mobile`: EAS Build for iOS/Android binaries

---

## 9. Testing

- Backend: pytest suite under `hrms_backend/tests/`
- Web: Vitest + Testing Library (`npm test`)
- Mobile: Jest configured but no tests currently present

---

## 10. Security & Compliance

- JWT-based authentication with role-based access control
- Row-level multi-tenancy scoping
- Rate limiting middleware
- CORS enforcement
- Audit logging for compliance
- Sensitive data masking utilities
- Disaster recovery strategy documented in `hrms_backend/DISASTER_RECOVERY.md`

---

## 11. Current State Notes

- Seed data scripts have been removed from the repository for security reasons.
- No default credentials are checked into source.
- Production URLs and secrets must be provided via environment variables or secret managers.

---

## 12. Repository Structure

```
D:\hrmsnew\
├── hrms_backend\
│   ├── main.py
│   ├── models.py
│   ├── database.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── render.yaml
│   ├── fly.toml
│   ├── routers\
│   ├── controllers\
│   ├── services\
│   ├── core\
│   ├── schemas\
│   ├── migrations\
│   ├── tests\
│   └── ...
├── hrms_react_web\
│   ├── package.json
│   ├── index.html
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── src\
│   └── ...
├── hrms_mobile\
│   ├── .env.example
│   ├── src\
│   └── ...
└── hrms_tenant_hub\
    ├── package.json
    ├── index.html
    ├── Dockerfile
    ├── src\
    └── ...
```

---

*Document generated for production-readiness review and team onboarding.*
