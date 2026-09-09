# HRMS - Quick Start Deployment Guide

Get your HRMS platform live in under 30 minutes.

---

## Before You Start

**Accounts needed:**
- [Render](https://render.com) (free tier)
- [Vercel](https://vercel.com) (free tier)
- PostgreSQL database (Render managed DB or [Supabase](https://supabase.com) free tier)

**Time estimate:** 25-30 minutes

---

## Step 1: Deploy Backend to Render (10 min)

### 1.1 Push code to GitHub

```bash
cd D:\hrmsnew
git add .
git commit -m "Production ready"
git push origin main
```

### 1.2 Create Render Web Service

1. Go to https://render.com → New Web Service
2. Connect your GitHub repo
3. **Root Directory:** `hrms_backend`
4. **Build Command:** `pip install -r requirements-render.txt`
5. **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Click "Create Web Service"

### 1.3 Set Environment Variables

In Render dashboard → Environment, add:

```
DATABASE_URL=postgresql://user:pass@host:5432/hrms_prod
APP_ENV=production
JWT_SECRET_KEY=<run: python -c "import secrets; print(secrets.token_urlsafe(48))">
ADMIN_EMAIL=admin@hrms.com
ADMIN_PASSWORD=YourStrongPassword123!
CORS_ORIGINS=https://your-web-app.vercel.app,https://your-tenant-hub.vercel.app
ALLOWED_HOSTS=your-backend.onrender.com
RUN_DB_INIT=true
RUN_SCHEMA_SYNC=true
SEED_DEFAULT_USERS=true
SEED_PASSWORD=SameAsAdminPassword123!
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
FROM_EMAIL=noreply@yourdomain.com
ENABLE_RATE_LIMITING=true
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_PERIOD=60
ENABLE_AUDIT_LOGGING=true
DEBUG=false
```

**Generate Gmail App Password:**
1. Go to https://myaccount.google.com/apppasswords
2. Enable 2FA if not already
3. Generate app password for "Mail"
4. Use that 16-char code as SMTP_PASSWORD

### 1.4 Wait for Deploy

Render will build and deploy (~5 min). Copy the URL: `https://your-app.onrender.com`

---

## Step 2: Deploy Web App to Vercel (5 min)

### 2.1 Create Vercel Project

1. Go to https://vercel.com/new
2. Import your GitHub repo
3. **Root Directory:** `hrms_react_web`
4. Framework: Vite (auto-detected)

### 2.2 Set Environment Variable

In Vercel → Settings → Environment Variables:

```
VITE_API_URL=https://your-backend.onrender.com/api
```

### 2.3 Deploy

Click "Deploy". Vercel builds automatically (~2 min).

Copy the URL: `https://your-web-app.vercel.app`

---

## Step 3: Deploy Tenant Hub to Vercel (5 min)

### 3.1 Create Vercel Project

1. Go to https://vercel.com/new
2. Import same GitHub repo
3. **Root Directory:** `hrms_tenant_hub`
4. Framework: Vite (auto-detected)

### 3.2 Set Environment Variables

```
VITE_API_URL=https://your-backend.onrender.com/api
VITE_HRMS_URL=https://your-web-app.vercel.app
```

### 3.3 Deploy

Click "Deploy". Copy the URL: `https://your-tenant-hub.vercel.app`

---

## Step 4: Update CORS on Backend (2 min)

Go back to Render → Environment variables, update:

```
CORS_ORIGINS=https://your-web-app.vercel.app,https://your-tenant-hub.vercel.app
ALLOWED_HOSTS=your-backend.onrender.com
```

Redeploy (automatic on save).

---

## Step 5: Test Everything (5 min)

### 5.1 Backend Health Check

Visit: `https://your-backend.onrender.com/health`

Should return: `{"status": "healthy"}`

### 5.2 Login to Tenant Hub

1. Visit: `https://your-tenant-hub.vercel.app`
2. Email: `superadmin@hrms.com`
3. Password: `SameAsAdminPassword123!` (from SEED_PASSWORD)
4. Should see the Control Hub dashboard

### 5.3 Login to Web App

1. Visit: `https://your-web-app.vercel.app`
2. Email: `manager@hrms.com`
3. Password: `SameAsAdminPassword123!`
4. Should see the HRMS dashboard

### 5.4 Create First Tenant

1. In tenant hub, go to "Tenants"
2. Click "Create Tenant"
3. Fill in organization details
4. Create admin user for the tenant
5. Note the credentials

### 5.5 Test Tenant Login

1. Logout of tenant hub
2. Go to web app
3. Login with the tenant admin credentials you just created
4. Should work — tenant can now use the HRMS

---

## Step 6: Disable Seeding (Important!)

After first successful deployment:

1. In Render → Environment variables
2. Set `SEED_DEFAULT_USERS=false`
3. Save (triggers redeploy)

This prevents duplicate users on future deploys.

---

## Mobile App (Optional)

### Build APK

```bash
cd hrms_mobile
npm install --legacy-peer-deps
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

APK location: `android/app/build/outputs/apk/release/app-release.apk`

### Set API URL

Create `hrms_mobile/.env`:

```
EXPO_PUBLIC_API_URL=https://your-backend.onrender.com/api
```

---

## Troubleshooting

### Backend won't start
- Check Render logs for errors
- Verify DATABASE_URL is correct
- Ensure all env vars are set

### Frontend shows blank page
- Check browser console for errors
- Verify VITE_API_URL is set in Vercel
- Check Vercel function logs

### CORS errors
- Verify CORS_ORIGINS includes both frontend URLs
- No trailing slashes in URLs
- Must be HTTPS in production

### Can't login
- Verify backend is healthy (`/health` endpoint)
- Check SEED_PASSWORD matches what you're typing
- Try `superadmin@hrms.com` with the SEED_PASSWORD value

---

## What's Live Now

✅ Backend API: `https://your-backend.onrender.com`  
✅ Web App: `https://your-web-app.vercel.app`  
✅ Tenant Hub: `https://your-tenant-hub.vercel.app`  
✅ Superadmin user: `superadmin@hrms.com`  
✅ Default users seeded: superadmin, hr, manager, employee  

---

## Next Steps

1. **Create tenant organizations** via tenant hub
2. **Onboard employees** via web app
3. **Distribute mobile app** to employees
4. **Configure payroll** settings per tenant
5. **Start charging** $5/month per tenant

---

## Cost Summary

**Free tier (testing):**
- Render: $0 (spins down after 15 min idle)
- Vercel: $0 (generous free tier)
- Supabase: $0 (500MB database)
- **Total: $0/month**

**Production (always-on):**
- Render: $7/month
- Vercel: $0
- Database: $7-25/month
- **Total: $14-32/month**

**Break-even:** 3-7 tenants at $5/month

---

## Support

- **Backend logs:** Render dashboard → Logs
- **Frontend logs:** Vercel dashboard → Functions
- **Database:** Render dashboard → Database tab
- **Docs:** See DEPLOYMENT.md for detailed guide

You're live. Start creating tenants and charging.
