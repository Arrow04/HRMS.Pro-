# Security Policy

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately via **GitHub Security Advisories** on this repository
(.Security → Report a vulnerability) or email the maintainer listed on the
GitHub profile. Include:

- Description and potential impact
- Steps to reproduce (PoC if possible)
- Affected version/commit

You'll get an acknowledgement within **72 hours** and a fix timeline within
**14 days** for critical issues (payroll data exposure, auth bypass, tenant
leakage, money-manipulation bugs).

## Supported versions

| Version | Supported |
|---|---|
| `hrmsnew` branch (latest) | ✅ |
| Older commits | ❌ (upgrade to latest) |

## Security design notes

- **Multi-tenancy:** every query is organization-scoped; company isolation on
  payroll/attendance/leave.
- **Auth:** JWT with role checks; client-supplied identity overrides are rejected.
- **Money controls:** maker-checker on payroll approvals; hard period cutoffs;
  hash-chained audit log with verification endpoint (`GET /api/audit/verify`).
- **Secrets:** environment variables only — never in source. If you find a
  committed secret, report it privately.
- **PII:** employee data is tenant-scoped; payslips and tax documents require
  authentication and org membership.

## For integrators

If you deploy HRMS.Pro! for a company:
- Set a strong `JWT_SECRET_KEY` (never the example value)
- Restrict `.env` file permissions; never ship it in images
- Put the app behind HTTPS; enable CORS only for your frontend origin
- Run the backend as a non-root user; keep PostgreSQL on a private network
