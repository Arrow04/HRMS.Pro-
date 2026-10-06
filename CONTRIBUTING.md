# Contributing to HRMS.Pro!

Thanks for helping improve HRMS.Pro!. The code is **source-available under the
Elastic License 2.0** — by contributing, you agree your contributions are
licensed under the same terms (the standard CLA-free inbound = outbound model).

## Ground rules

1. **Statutory correctness over features.** A wrong PF ceiling is worse than a
   missing button. Every statutory value must be configuration, never a code
   literal.
2. **Tests are mandatory.** Backend: `python -m pytest -q` must pass (660+).
   Frontend: `npm run build` + `npx tsc -p tsconfig.app.json --noEmit` must pass.
3. **Tenant safety.** Every query and action must be organization-scoped.
   Never leak data across companies/organizations.
4. **Money moves need maker-checker.** No code path may approve what it
   generated. No silent edits to locked/finalized payroll.
5. **No hardcoded secrets.** Environment variables only. Never commit `.env`.

## Development setup

```bash
# Backend
cd hrms_backend
pip install -r requirements.txt
cp .env.example .env    # DATABASE_URL, JWT_SECRET_KEY, admin credentials
python main.py

# Frontend
cd hrms_react_web
npm install
npm run dev
```

## Pull requests

- Branch from `hrmsnew`; keep PRs focused (one concern per PR).
- Describe **what** changed and **why**; link issues.
- Include tests for behavior changes (bugfix = regression test).
- Update docs when behavior or env vars change.

## Where to help

- Good first issues are labeled `good first issue`
- Statutory coverage gaps (new state PT/LWF, new form layouts) are high value
- Performance (N+1 queries at scale) and accessibility are welcome

## Reporting bugs

Use GitHub Issues with: steps to reproduce, expected vs actual, org size
(single/multi-company), and whether payroll money was involved.
