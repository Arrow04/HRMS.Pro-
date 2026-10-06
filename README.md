# HRMS.Pro!

**Source-available HRMS for India** — attendance, leave, statutory-aware payroll (PF / ESI / PT / TDS / gratuity), compliance registers, F&F settlement, performance and exits — one system, configured per company.

> **License: Elastic License 2.0 (source-available, NOT open source).**
> You can read, run, self-host and modify it. You **cannot** offer it to third
> parties as a hosted/managed service, and you cannot strip the license notices.
> See [LICENSE](./LICENSE) and the FAQ below.

---

## Why it exists

Indian payroll compliance is unforgiving — one wrong PF ceiling or missed ECR
filing is a penalty. HRMS.Pro! is built so every statutory number is
**configuration**, every payslip is **reproducible**, and every money movement
is **maker-checker approved** and **audit-logged** in a hash-chained trail.

## What's inside

| Module | Highlights |
|---|---|
| **Payroll** | Policy-driven engine; PF/EPS/EDLI/ESI/PT/LWF/gratuity/bonus all rule-configured; 26/30-day proration; cumulative TDS with regimes and slabs |
| **Compliance** | Filing calendar with due dates, EPF ECR / ESI / PT / TDS / gratuity registers, Form 16, audit-chain verification |
| **Exits (F&F)** | Salary until LWD, gratuity, leave encashment, notice pay/recovery, **TDS on settlement**, asset recovery |
| **Attendance** | Workweek, overtime tiers, late/half-day rules, geofence, selfie check-in, comp-off |
| **Leave** | Templates with accrual (frontloaded/monthly/quarterly), carry-forward, encashment rules, idempotent accrual ledger |
| **Maker-checker** | Generator ≠ approver enforced; hard period cutoffs; immutable payslip snapshots |
| **AI assistant** | Answers from live org data (payroll, leave, compliance); runs payroll/finalize/init actions; optional LLM brain via `AI_LLM_API_KEY` (tool-calling), local analyst fallback always on |
| **Setup** | Company-scoped guided configuration inside each module's own wizard + dashboard checklist |

## Tech stack

- **Backend:** Python · FastAPI · SQLAlchemy · PostgreSQL (Redis optional)
- **Frontend:** React · TypeScript · Vite · Tailwind CSS
- **AI:** local analyst (no dependencies) + optional OpenAI-compatible LLM (Gemini/OpenAI/Groq/Ollama)

## Quickstart

### Docker (recommended)

```bash
cp hrms_backend/.env.example hrms_backend/.env   # set DATABASE_URL etc.
docker compose up
```

### Manual

```bash
# Backend
cd hrms_backend
pip install -r requirements.txt
cp .env.example .env        # DATABASE_URL, JWT_SECRET_KEY, ADMIN_EMAIL/PASSWORD
python main.py              # http://localhost:8000

# Frontend
cd hrms_react_web
npm install
npm run dev                 # http://localhost:5173
```

Login with the admin credentials from `.env` (default seed: `admin@hrms.com`).

### Optional AI brain

```env
# hrms_backend/.env  — any OpenAI-compatible endpoint
AI_LLM_API_KEY=your-key          # free Gemini key: https://aistudio.google.com/apikey
AI_LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
AI_LLM_MODEL=gemini-3.8-flash
```

Without a key the assistant runs on the built-in local brain (data-grounded
analyst + app knowledge) — it is never broken, only less conversational.

## Architecture

```
hrms_backend/          FastAPI app
  routers/             HTTP surface (auth, payroll, compliance, AI…)
  services/            domain engines (payroll, statutory rules, F&F, archival)
  hrms_ai/             AI brain: analyst, app knowledge, LLM tool-calling, actions
  models.py            SQLAlchemy models
hrms_react_web/        React SPA (Vite)
```

**Statutory architecture:** `StatutorySetting` (org/company) → seeded
`StatutoryRuleConfig` → Act defaults. A government notification is a data
change, never a code deploy. Rule engine resolves company → org → state →
country with effective dating.

## Tests

```bash
cd hrms_backend && python -m pytest -q      # 660+ tests
cd hrms_react_web && npm run build
```

## License — plain English

| You **can** | You **cannot** |
|---|---|
| Use it for your own company (self-host) | Offer it to third parties **as a hosted/managed service** |
| Read, study and learn from the code | Circumvent or remove license-key functionality |
| Modify it for internal use | Remove/obscure license or copyright notices |
| Distribute copies **with this license included** | Remove the LICENSE file from copies |

**"Can I fork it?"** — Yes, for your own/internal use. Forking it to run a
competing HRMS **service** for other companies is what the license forbids.

**"Is this open source?"** — No. It is **source-available** under the Elastic
License 2.0 (the same model Elastic uses). Open-source licenses (MIT/AGPL)
would allow competitors to sell your product as a service; this one doesn't.

**"Can I contribute?"** — Yes — see [CONTRIBUTING.md](./CONTRIBUTING.md).
Contributions are accepted under this same license.

**Security issues:** report privately per [SECURITY.md](./SECURITY.md) — never
in a public issue.

---

Built for Indian statutory reality. Configured per company. Audited to the rupee.
