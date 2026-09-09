# HRMS Production Deployment Guide

Complete deployment guide for the HRMS multi-tenant SaaS platform.

## Architecture Overview

- **Backend**: FastAPI on Render (https://hrms-api-8yv3.onrender.com)
- **Web App**: React 19 on Vercel (https://hrms-web.vercel.app)
- **Mobile App**: React Native/Expo (Android/iOS builds)
- **Tenant Hub**: React 19 on Vercel (superadmin control panel)
- **Database**: PostgreSQL (Render managed database or Supabase free tier)

---

## Prerequisites

1. **Render account** (free tier works for backend)
2. **Vercel account** (free tier works for frontends)
3. **PostgreSQL database** (Render managed DB or Supabase free tier)
4. **Redis** (optional, for caching - Upstash free tier works)
5. **Gmail account with App Password** (for email notifications)

---

## 1. Backend Deployment (Render)

### 1.1 Prepare Environment Variables

In Render dashboard, set these environment variables:

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/hrms_prod
APP_ENV=production
JWT_SECRET_KEY=<generate-64-char-random-string>
ADMIN_EMAIL=admin@hrms.com
ADMIN_PASSWORD=<strong-password>
CORS_ORIGINS=https://hrms-web.vercel.app,https://hrms-tenant-hub.vercel.app
ALLOWED_HOSTS=hrms-api-8yv3.onrender.com

# Database initialization
RUN_DB_INIT=true
RUN_SCHEMA_SYNC=true
SEED_DEFAULT_USERS=true
SEED_PASSWORD=<strong-password-for-default-users>

# Email (Gmail App Password)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
FROM_EMAIL=noreply@yourdomain.com

# Optional
REDIS_URL=redis://default:pass@host:6379
ENABLE_RATE_LIMITING=true
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_PERIOD=60
ENABLE_AUDIT_LOGGING=true
DEBUG=false
```

**Generate JWT_SECRET_KEY:**
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 1.2 Deploy to Render

1. Connect your GitHub repo to Render
2. Set root directory: `hrms_backend`
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables from above
6. Deploy

### 1.3 Run Database Migrations

After first deploy, run migrations via Render shell or locally:

```bash
cd hrms_backend
alembic upgrade head
```

### 1.4 Seed Initial Users

On first startup with `SEED_DEFAULT_USERS=true`, the backend creates:
- `superadmin@hrms.com` (role: superadmin) - **can access tenant hub**
- `hr@hrms.com` (role: hr_executive)
- `manager@hrms.com` (role: hr_manager)
- `employee@hrms.com` (role: employee)

All use the password from `SEED_PASSWORD` env var.

**Important**: After seeding, set `SEED_DEFAULT_USERS=false` and redeploy.

---

## 2. Web App Deployment (Vercel)

### 2.1 Configure Environment

In Vercel project settings, add:

```bash
VITE_API_URL=https://hrms-api-8yv3.onrender.com/api
```

### 2.2 Deploy

1. Connect GitHub repo to Vercel
2. Root directory: `hrms_react_web`
3. Framework preset: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy

Vercel automatically uses `vercel.json` for API proxying and security headers.

---

## 3. Tenant Hub Deployment (Vercel)

### 3.1 Configure Environment

In Vercel project settings, add:

```bash
VITE_API_URL=https://hrms-api-8yv3.onrender.com/api
VITE_HRMS_URL=https://hrms-web.vercel.app
```

### 3.2 Deploy

1. Connect GitHub repo to Vercel
2. Root directory: `hrms_tenant_hub`
3. Framework preset: Vite
4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy

---

## 4. Mobile App Build

### 4.1 Configure API URL

Create `hrms_mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=https://hrms-api-8yv3.onrender.com/api
```

### 4.2 Build for Android

```bash
cd hrms_mobile
npm install --legacy-peer-deps
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

APK will be at: `android/app/build/outputs/apk/release/app-release.apk`

### 4.3 Build for iOS (requires Mac)

```bash
cd hrms_mobile
npm install --legacy-peer-deps
npx expo prebuild --platform ios
cd ios
pod install
open *.xcworkspace
# Build in Xcode or use:
xcodebuild -scheme YourApp -configuration Release -archivePath build/YourApp.xcarchive archive
```

### 4.4 EAS Build (Recommended)

For cloud builds without local setup:

```bash
npm install -g eas-cli
eas login
eas build --platform android
eas build --platform ios
```

---

## 5. Post-Deployment Checklist

### 5.1 Backend Verification

```bash
# Health check
curl https://hrms-api-8yv3.onrender.com/health

# Test login
curl -X POST https://hrms-api-8yv3.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@hrms.com","password":"your-seed-password"}'
```

### 5.2 Frontend Verification

1. Visit https://hrms-web.vercel.app
2. Login with seeded user credentials
3. Verify dashboard loads
4. Test creating an employee
5. Test attendance marking

### 5.3 Tenant Hub Verification

1. Visit https://hrms-tenant-hub.vercel.app
2. Login with `superadmin@hrms.com`
3. Verify only superadmin can access (try logging in as hr@hrms.com - should fail)
4. Test creating a new tenant organization
5. Verify tenant admin can login to web app

### 5.4 Mobile Verification

1. Install APK on test device
2. Login with employee credentials
3. Test attendance marking
4. Test leave application
5. Verify push notifications (if configured)

---

## 6. Security Hardening

### 6.1 Production Environment Variables

Ensure these are set correctly:

```bash
APP_ENV=production
DEBUG=false
ENABLE_RATE_LIMITING=true
CORS_ORIGINS=<specific-domains-only>
ALLOWED_HOSTS=<your-domain>
```

### 6.2 Database Security

- Use strong passwords for PostgreSQL
- Enable SSL/TLS for database connections
- Restrict database access to Render IP range
- Regular backups enabled

### 6.3 API Security

- Rate limiting enabled on auth endpoints
- CORS restricted to specific origins
- JWT tokens have reasonable expiry (1440 minutes = 24 hours)
- Token refresh flow implemented

### 6.4 Frontend Security

All deploy configs include:
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin

---

## 7. Monitoring & Maintenance

### 7.1 Render Monitoring

- Check dashboard for errors
- Monitor response times
- Set up uptime alerts

### 7.2 Application Logs

View logs in Render dashboard:
- Backend: Real-time logs available
- Frontends: Vercel function logs

### 7.3 Database Maintenance

```bash
# Run locally or via Render shell
# Check database size
SELECT pg_size_pretty(pg_database_size('hrms_prod'));

# Vacuum analyze (run weekly)
VACUUM ANALYZE;

# Check for long-running queries
SELECT * FROM pg_stat_activity WHERE state = 'active';
```

### 7.4 Backup Strategy

- Render: Automatic daily backups (retain 7 days)
- Supabase: Point-in-time recovery enabled
- Manual backup: `pg_dump` weekly to S3/GCS

---

## 8. Scaling Considerations

### 8.1 Horizontal Scaling

- Render: Upgrade plan for more memory/CPU
- Database: Upgrade to larger instance
- Redis: Upgrade plan for more connections

### 8.2 Performance Optimization

- Enable Redis caching (already implemented)
- Use CDN for static assets (Vercel does this automatically)
- Optimize database queries (add indexes as needed)
- Implement pagination for large lists

### 8.3 Multi-Region Deployment

For global users:
- Use Render's multi-region feature
- Deploy frontends to Vercel edge network (automatic)
- Consider Cloudflare for additional CDN layer

---

## 9. Troubleshooting

### 9.1 Backend Not Starting

- Check environment variables are set
- Verify DATABASE_URL is correct
- Check Render logs for errors
- Ensure all dependencies in requirements.txt

### 9.2 Frontend Build Fails

- Verify Node.js version (18+)
- Check all dependencies installed
- Review Vercel build logs
- Ensure .env variables are set in Vercel

### 9.3 Database Connection Issues

- Verify DATABASE_URL format
- Check database is running
- Ensure IP whitelist includes Render IPs
- Test connection locally with same credentials

### 9.4 CORS Errors

- Verify CORS_ORIGINS includes frontend domain
- Check for trailing slashes
- Ensure HTTPS in production
- Review browser console for specific error

---

## 10. Cost Optimization

### 10.1 Free Tier Limits

- **Render**: 750 hours/month (enough for 1 service always-on)
- **Vercel**: 100GB bandwidth/month, 100k function invocations
- **Supabase**: 500MB database, 2GB bandwidth
- **Upstash Redis**: 10k commands/day

### 10.2 Cost Reduction Tips

- Use Render's spin-down feature (free tier) - adds 30s cold start
- Optimize Vercel function duration
- Cache aggressively in Redis
- Use CDN for all static assets
- Compress images before upload

---

## 11. Support & Updates

### 11.1 Updating the Application

```bash
# Pull latest changes
git pull origin main

# Backend: Render auto-deploys on push
# Frontend: Vercel auto-deploys on push
# Mobile: Rebuild and redistribute APK/IPA
```

### 11.2 Database Migrations

```bash
# After pulling new code with migrations
cd hrms_backend
alembic upgrade head
```

### 11.3 Monitoring for Issues

- Set up Sentry for error tracking (optional)
- Monitor Render dashboard for errors
- Check Vercel analytics for performance
- Review user feedback regularly

---

## 12. Next Steps After Deployment

1. **Create tenant organizations** via tenant hub
2. **Onboard employees** via web app
3. **Distribute mobile app** to employees
4. **Configure payroll** settings per tenant
5. **Set up attendance** policies
6. **Customize leave types** per organization
7. **Enable notifications** (email/push)
8. **Train HR admins** on system usage

---

## Quick Start Commands

```bash
# Backend local development
cd hrms_backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload

# Web app local development
cd hrms_react_web
npm install
npm run dev

# Tenant hub local development
cd hrms_tenant_hub
npm install
npm run dev

# Mobile app local development
cd hrms_mobile
npm install --legacy-peer-deps
npx expo start
```

---

## Environment Variables Summary

### Backend (Required)
- `DATABASE_URL` - PostgreSQL connection string
- `APP_ENV` - production/development
- `JWT_SECRET_KEY` - 64-char random string
- `ADMIN_EMAIL` - Initial admin email
- `ADMIN_PASSWORD` - Initial admin password
- `CORS_ORIGINS` - Comma-separated frontend URLs
- `ALLOWED_HOSTS` - Backend domain

### Backend (Optional)
- `REDIS_URL` - Redis connection string
- `SMTP_*` - Email configuration
- `SEED_DEFAULT_USERS` - true/false
- `SEED_PASSWORD` - Password for seeded users

### Frontend (Web & Tenant Hub)
- `VITE_API_URL` - Backend API URL

### Mobile
- `EXPO_PUBLIC_API_URL` - Backend API URL

---

**Deployment Time Estimate**: 2-3 hours for initial setup
**Ongoing Maintenance**: 1-2 hours/week for monitoring and updates
