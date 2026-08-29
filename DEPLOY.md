# =============================================================================
# HRMS Cloud Deploy — Supabase + Render + Vercel
# =============================================================================

## Architecture

| Service        | Role                    | URL example                          |
|----------------|-------------------------|--------------------------------------|
| Supabase       | PostgreSQL DB           | (connection string only)             |
| Render         | FastAPI backend         | `https://hrms-api.onrender.com`      |
| Vercel         | Employee web app        | `https://hrms-web.vercel.app`        |
| Vercel         | **Control Hub** (admin) | `https://hrms-hub.vercel.app`        |
| Mobile         | Expo APK                | Server URL → Render API `/api`       |

---

## Step 1 — Supabase (database)

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Wait for the database to provision
3. Open **Project Settings → Database**
4. Copy **Connection string → URI** (Session mode, port `5432`)
   - Looks like: `postgresql://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres`
5. Replace `[PASSWORD]` with your database password

> The backend auto-adds `sslmode=require` for Supabase URLs.

---

## Step 2 — Render (backend API)

1. Push this repo to **GitHub**
2. Go to [render.com](https://render.com) → **New → Blueprint** (or Web Service)
3. Connect the repo
4. Set **Root Directory** to `hrms_backend` if deploying from monorepo root
5. Use `render.yaml` or configure manually:
   - **Runtime:** Python 3.11
   - **Build:** `pip install -r requirements-render.txt`
   - **Start:** `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1`
   - **Health check:** `/api/health/ready`

### Environment variables (Render dashboard)

| Variable | Example / notes |
|----------|-----------------|
| `APP_ENV` | `production` |
| `DATABASE_URL` | Supabase URI from Step 1 |
| `JWT_SECRET_KEY` | Random 64-char string |
| `ADMIN_PASSWORD` | Strong password (tenant admin `admin@hrms.com`) |
| `SEED_PASSWORD` | Password for seeded role users (`superadmin@hrms.com`, etc.) |
| `ADMIN_EMAIL` | `admin@hrms.com` |
| `CORS_ORIGINS` | `https://hrms-web.vercel.app,https://hrms-hub.vercel.app` |
| `ALLOWED_HOSTS` | `hrms-api.onrender.com` |
| `SEED_DEFAULT_USERS` | `true` (first deploy only) |
| `ALLOW_SQLITE_FALLBACK` | `false` |

6. Deploy and note your URL: `https://YOUR-SERVICE.onrender.com`
7. Test: `https://YOUR-SERVICE.onrender.com/api/auth/test`

> Free Render services **sleep after ~15 min idle**. First request may take 30–60 seconds.

---

## Step 3 — Vercel (employee web app)

1. Go to [vercel.com](https://vercel.com) → **Add New → Project**
2. Import the same GitHub repo
3. Set **Root Directory** to `hrms_react_web`
4. Framework: **Vite**
5. **Project name:** e.g. `hrms-web`

### Option A — Environment variable (recommended)

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://YOUR-SERVICE.onrender.com` |

Deploy. No `vercel.json` rewrite edits needed.

### Option B — Proxy rewrites

Edit `hrms_react_web/vercel.json` — replace `REPLACE_WITH_YOUR_RENDER_URL` with your Render hostname, then deploy.

---

## Step 4 — Vercel (Control Hub / super admin)

The **Control Hub** (`hrms_tenant_hub`) is the super-admin panel for tenants, plans, and system health.

1. Vercel → **Add New → Project** (second project, same GitHub repo)
2. **Root Directory:** `hrms_tenant_hub`
3. Framework: **Vite**
4. **Project name:** e.g. `hrms-hub`

### Environment variables

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://YOUR-SERVICE.onrender.com` |
| `VITE_HRMS_URL` | `https://hrms-web.vercel.app` (employee app from Step 3) |

Deploy, then add this URL to Render **CORS_ORIGINS** (comma-separated with the employee app URL):

```
https://hrms-web.vercel.app,https://hrms-hub.vercel.app
```

### Control Hub login

- **URL:** `https://hrms-hub.vercel.app`
- **Role required:** `superadmin`
- **Default seed user:** `superadmin@hrms.com` (password = `SEED_PASSWORD` on Render)

> Links inside Control Hub (“Open HRMS”) use `VITE_HRMS_URL` to point at the employee web app.

---

## Step 5 — Mobile app

In the APK login screen **Server URL**:

```
https://YOUR-SERVICE.onrender.com/api
```

Use **HTTPS** (not `http://192.168.x.x`).

Rebuild the APK with `EXPO_PUBLIC_API_URL` in `eas.json` when you have the final Render URL.

---

## Default login (after first seed)

**Employee app** (`hrms-web`):
- Email: `admin@hrms.com`
- Password: `ADMIN_PASSWORD` on Render

**Control Hub** (`hrms-hub`):
- Email: `superadmin@hrms.com`
- Password: `SEED_PASSWORD` on Render

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Render build fails / too large | Uses `requirements-render.txt` (no EasyOCR/torch) |
| `Production configuration validation failed` | Set all required env vars on Render |
| CORS error on web | Add Vercel URL to `CORS_ORIGINS` on Render |
| Mobile "cannot reach server" | Use `https://...onrender.com/api` |
| Slow first API call | Render free tier waking from sleep |
| DB connection error | Check Supabase password, use Session pooler URI |

---

## Optional later

- **Redis:** Upstash free tier → set `REDIS_URL` on Render
- **Custom domain:** Render + Vercel dashboard
- **EasyOCR:** Not included on Render slim build; document upload OCR disabled until you upgrade plan
