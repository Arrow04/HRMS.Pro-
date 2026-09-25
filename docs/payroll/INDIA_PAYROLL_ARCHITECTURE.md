# HRMS Pro — Indian Payroll Engine: Domain Architecture

> **North star:** *The law changes; the rule changes; the payroll engine does not.*
> The engine contains the **mechanism** of payroll. Configuration/rules contain the
> **legal interpretation**. India-first, sector-neutral, effective-dated, auditable.

This document is the design deliverable requested before implementation
(items 1–15 of the mandate). It is grounded in the current codebase and marks
every capability as **[HAVE]**, **[PARTIAL]** or **[NEW]**.

---

## 1. Domain Architecture

### 1.1 One core, many profiles

```
                        HRMS PRO
                           │
                    EMPLOYEE MASTER            [HAVE] models.Employee et al.
                           │
                    ┌──────▼───────┐
                    │ PAYROLL CORE │            [HAVE] services/payroll_service.py
                    └──────┬───────┘
                           │
                     RULE RESOLVER              [PARTIAL] services/statutory_rule_engine.py
                           │
       ┌───────────────────┼────────────────────┐
    CENTRAL              STATE               ORG/SECTOR
    RULES                RULES                RULES
   (country)          (state_code)        (organization/company)
       └───────────────────┼────────────────────┘
                           │
                    WAGE DEFINITION             [NEW] wage_engine
                           │
             ┌─────────────┼──────────────┐
          EARNINGS       TAXATION       STATUTORY
             │             │          ┌───┼────┐
             │             │         PF  ESI  NPS   ...
             └─────────────┼──────────┴───┴────┘
                           │
                        NET PAY
                           │
              ┌────────────┼───────────┐
           PAYSLIP      ACCOUNTING   BANK/REPORTS
```

**Hard rule (from the mandate, non-negotiable):** Government / PSU / private /
daily-wage / contract labour are **NOT separate engines**. They are:

```
One Payroll Core
 + Employment Profile   (how wages are earned: monthly/daily/hourly/piece/contract…)
 + Wage Profile         (which wage bases apply: PF wages, ESI wages, bonus wages…)
 + Sector Profile       (government pay-matrix levels, PSU grades — data, not code)
 + Statutory Rules      (effective-dated, central)
 + State Rules          (effective-dated, state_code scoped)
```

### 1.2 Bounded contexts

| Context | Responsibility | Current home |
|---|---|---|
| Employee Master | Contracts, pay frequency, statutory IDs | `models.Employee` **[HAVE]** |
| Attendance & Leave | Punched/paid days, leave paid-ness | `_get_attendance_counts` **[HAVE]** |
| Rule Platform | Versioned rules, resolution, simulation | `StatutoryRule` / `statutory_rule_engine` **[PARTIAL]** |
| Wage Engine | Named wage bases per rule | **[NEW]** |
| Earnings & Deductions | Components, variable pay, loans | `PayrollComponent`, `SalaryLoan` **[PARTIAL]** |
| Taxation | Regimes, slabs, TDS, YTD | `TaxRegime/TaxSlab`, `_compute_cumulative_tds` **[HAVE]** |
| Statutory Modules | EPF/EPS/EDLI, ESI, PT, LWF, Bonus, Gratuity, MinWages, NPS | rule engine calculators **[PARTIAL]** (NPS/MinWages **[NEW]**) |
| Payroll Runs | Lifecycle, approval, immutability | `PayrollRun`, `Payroll.status` **[PARTIAL]** |
| Arrears & Retro | Rule diffs, adjustments, recovery | **[NEW]** |
| F&F | Exit settlement | `exit_management_service` **[PARTIAL]** |
| Accounting / Bank / Reporting | Journals, batches, statutory files | `accounting_service` **[PARTIAL]** |

---

## 2. ER / Data Model

Existing tables are kept; additions are marked. All configurable entities carry
`effective_from` / `effective_to` / `status` where legislation can change.

```
organizations ─┬─ legal_entities(company) ─┬─ establishments / locations
               │                            ├─ branches, departments, cost_centers
               │                            └─ payroll_groups ── payroll_calendars
               │                                                 └─ payroll_periods
               ├─ employees ── employment_contracts ── employment_type
               │       │── salary_assignments ── salary_structures ── salary_components
               │       │── statutory_ids (UAN, ESI, PRAN, PF)        [PARTIAL: columns exist]
               │       └── payroll_results ── payroll_result_lines    [NEW: lines w/ rule refs]
               │
               ├─ statutory_rules (versioned, JSON definition)        [HAVE]
               ├─ tax_regimes ── tax_slabs                            [HAVE]
               ├─ minimum_wage_rules                                  [NEW]
               ├─ wage_definitions                                    [NEW]
               ├─ government_notifications                            [NEW]
               ├─ payroll_runs ── payroll_run_employees               [PARTIAL]
               ├─ payroll_adjustments / arrears / reversals           [NEW]
               ├─ loans, advances, reimbursement_claims               [PARTIAL: SalaryLoan]
               ├─ fnf_settlements, gratuity_calculations              [PARTIAL]
               ├─ payroll_approvals                                   [NEW]
               ├─ payroll_audit_logs                                  [PARTIAL: AuditLog]
               └─ accounting_entries, payment_batches/transactions    [PARTIAL]
```

### 2.1 Core new entities (sketch)

```text
wage_definitions
  id, organization_id, company_id, code (PF_WAGES|ESI_WAGES|BONUS_WAGES|…),
  expression (DSL), effective_from, effective_to, status, version

payroll_result_lines                       -- explainability backbone
  id, payroll_result_id, component_code, label, amount, side (earning|deduction|employer),
  rule_id, rule_version, formula, inputs(JSON), effective_date, wage_basis

government_notifications
  id, authority, notification_number, title, publication_date, effective_date,
  source_url, summary, status(draft|review|approved|published), affected_rule_ids

payroll_adjustments (arrears/recovery)
  id, payroll_result_id, source (retro_rule|revision|correction), original(JSON),
  revised(JSON), delta_amount, reason, audit_ref

payroll_approvals
  id, payroll_run_id, step, role, approver_id, decision, decided_at, comment
```

`StatutoryRule` already implements the central pattern (rule_type, subtype,
country, state_code, organization/company scope, effective_from/to, JSON
definition, notification_number, gazette_url). New rule types slot in without
core changes.

---

## 3. Rule-Engine Architecture

```
        resolve(rule_type, subtype, org, company, state, country, as_of)
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │  1. exact org+company+state match                    │
        │  2. org+state                                        │
        │  3. org (company NULL, state NULL)                   │
        │  4. central + state (org NULL)                       │
        │  5. central (state NULL)                             │
        └──────────────────────────┬──────────────────────────┘
                                   │  most specific wins;
                                   │  effective_from ≤ as_of ≤ effective_to
                                   ▼
                        RuleDefinition (JSON)
                                   │
                  safe evaluator (DSL, §4) — never exec()
```

* **[PARTIAL→HARDEN]** `StatutoryRuleEngine.resolve/specificity` already does
  hierarchy + dating. Harden: deterministic tie-breaks, conflict detection
  (two same-specificity active rules → validation error), and a resolve
  **trace** (which rows were considered and why the winner won) for §43.
* Every statutory calculator (PF/ESI/PT/Bonus/Gratuity/OT/Tax) takes its
  parameters **only** from resolved rules. Legacy `StatutorySetting` rows remain
  as an org-level rule source (migrated into `statutory_rules` in Phase 2).

---

## 4. Rule DSL / Expression Design

Safe, side-effect-free, no `eval`. AST-walk interpreter over a tiny grammar:

```text
expression := term (('+'|'-'|'*'|'/') term)*
term       := NUMBER | IDENT | call | '(' expression ')'
call       := 'MIN' '(' expr ',' expr ')'
            | 'MAX' '(' expr ',' expr ')'
            | 'ROUND' '(' expr [',' expr] ')'
            | 'IF' '(' cond ',' expr ',' expr ')'
cond       := expr ('='|'<'|'<='|'>'|'>='|'!=') expr | cond ('AND'|'OR') cond | 'NOT' cond
IDENT      := [A-Z_][A-Z0-9_]*     # bound to the wage/evaluation context
```

**Rule definition JSON shapes** (one `definition` per rule_type):

```jsonc
// parameter
{"kind": "param", "name": "PF_EMPLOYEE_RATE", "value": 12.0}
// formula
{"kind": "formula", "wage_basis": "PF_WAGES", "expr": "MIN(PF_WAGES * RATE / 100, MAX_MONTHLY)"}
// slab
{"kind": "slab", "basis": "GROSS_WAGES",
 "slabs": [{"from": 0, "to": 15000, "rate": 0, "fixed": 0}, …]}
// conditional / threshold / eligibility
{"kind": "conditional", "if": "EMPLOYEE_STATE = 'KA' AND GROSS_WAGES <= 21000",
 "then": {"kind": "param", "value": 0.75}, "else": {"kind": "param", "value": 0}}
// cap/floor are just MIN/MAX in formulas; dependency via basis references
```

Evaluation context binds: `BASIC`, `DA`, `GROSS_WAGES`, each named wage basis,
`PAID_DAYS`, `WORKING_DAYS`, `SERVICE_YEARS`, `EMPLOYEE_STATE`, `REGIME`, …
Unknown identifier at evaluation time → **explicit capability error**
(mandate §60 Test 7: "identify the missing capability instead of silently
producing an incorrect payroll").

---

## 5. Payroll Calculation Graph

Deterministic DAG (order matters, no cycles):

```text
Employee + Employment Profile
  → Applicable Rules (resolver trace attached)
  → Payroll Period (calendar)
  → Attendance counts → Leave paid-ness → Holiday credits
  → Wage Calculation          (monthly | daily×days | hours×rate | units×rate | composite)
  → Earnings (components, each with rule refs)
  → Overtime (base × hours × multiplier — from rules)
  → Variable Pay (fixed|pct|slab|formula|target)
  → Reimbursements → Taxable Perquisites
  → GROSS EARNINGS
  → Wage Bases (PF_WAGES, ESI_WAGES, BONUS_WAGES, GRATUITY_WAGES, OT_WAGES, TAXABLE_SALARY)
  → Employee Statutory (EPF, ESI, PT, LWF, NPS…)
  → Income Tax / TDS (regime, YTD, projection)
  → Other Deductions (loans/advances/recoveries)
  → NET PAY
  → Employer Contributions (EPF/EPS/EDLI, ESI, NPS, gratuity accrual) → EMPLOYER COST
  → Validation → Accounting → Payslip → Statutory reports → Payment batch
```

The existing `calculate_payroll` already follows this shape; Phase 2 refactors
it into explicit stages whose intermediate values and rule references are
recorded in `payroll_result_lines` (explainability).

---

## 6. Indian Statutory Module Architecture

Each module = **rule types + a calculator that only reads resolved rules**:

| Module | Rule types | Status |
|---|---|---|
| EPF/EPS/EDLI | `pf_contribution`, `pf_exclusion`, `pf_edli` | **[PARTIAL]** — calculator exists, params must all come from rules |
| ESI | `esi_contribution`, `esi_eligibility` | **[PARTIAL]** |
| Professional Tax | `professional_tax` (state slabs) | **[PARTIAL]** — `data/state_compliance.py` migrates into rules |
| LWF | `lwf` (state, periodicity) | **[PARTIAL]** |
| Gratuity | `gratuity` (eligibility, 15-day rule, accrual) | **[PARTIAL]** — settlement **[NEW]** |
| Bonus | `bonus` (Payment of Bonus Act: 8.33–20%, ceilings) | **[PARTIAL]** |
| Overtime | `overtime` (Factories Act ×2, shops ×1, custom) | **[PARTIAL]** |
| Minimum Wages | `minimum_wage` (state/zone/scheduled-employment/skill) | **[NEW]** |
| NPS | `nps` (employee/employer, 80CCD, corporate NPS) | **[NEW]** — inside a generic **Retirement & Pension** module (NPS, EPF/EPS, superannuation, gratuity; future schemes as new rule types) |

Adding a scheme whose math fits `param/formula/slab/conditional` =
**configuration only**. A scheme needing a new computational concept is
surfaced as a capability error, never a wrong payslip.

---

## 7. Employment Models (profiles, not engines)

`EmploymentProfile` (config) referenced by `employment_contracts`:

```text
code: MONTHLY | DAILY | HOURLY | WEEKLY | BIWEEKLY | SEMI_MONTHLY |
      PIECE_RATE | COMMISSION | CONTRACT | TEMPORARY | PART_TIME |
      FULL_TIME | APPRENTICE | TRAINEE | CONSULTANT | GOVERNMENT |
      PSU | EXECUTIVE | CUSTOM
wage_method: month_salary | rate×days | rate×hours | units×rate | composite
day_basis: calendar | working | actual | scheduled | paid | divisor
hour_multipliers: {normal, overtime, night, holiday, weekend}  (rules override)
statutory_default_profile: e.g. "epf+esi+pt+lwf" | "nps+pt" | "contractor"
```

* Daily worker: `₹650/day × 24 eligible days + OT − deductions`
* Corporate: `Basic+DA+HRA+allowances+variable − TDS − PF − ESI/PT`
* Gov/PSU: `pay-level basic + DA + allowances + NPS + arrears − tax/statutory`

…all three run through the **same** pipeline in §5. Statutory eligibility is
decided by **rules** (`eligibility` kind), never by the profile code alone.
Government/PSU **Sector Profiles** are data: pay-matrix levels, DA slabs,
allowance catalogs — stored as salary-structure templates + rules
(`pay_matrix` entries). **[NEW]** as data; no new engine.

---

## 8. Effective-Dating / Versioning Model

```text
Rule V1: effective_from=2025-04-01, effective_to=2026-03-31, status=published
Rule V2: effective_from=2026-04-01, effective_to=NULL,       status=published
```

* **Never overwrite a published row.** New law = INSERT new version.
* Every `payroll_result_line` stores `rule_id + rule_version + effective_date`
  → historical payslips always re-explain with the rules of that time.
* Entities versioned this way: statutory rules, tax slabs, wage definitions,
  minimum wages, salary structures (via `SalaryRevision` **[HAVE]**),
  component taxability flags (§37).

---

## 9. Notification → Rule Workflow

```text
GovernmentNotification (authority, number, publication_date, effective_date)
  → Compliance Review (assignee, notes)
  → Affected Rules identified (rule_type + scope + period)
  → Draft Rule Version (status=draft)
  → Simulation (§42: old vs new impact on sample + full population)
  → Regression suite (golden scenarios §59) runs automatically
  → Approval (named approver; segregation of duties)
  → Publish (immutable; effective-dated)
  → Automatic application to future periods
  → If effective_from < last processed period → Retro engine (§34) fires
```

---

## 10. Payroll Lifecycle

```text
DRAFT → CALCULATING → CALCULATED → VALIDATION → PENDING_APPROVAL
      → APPROVED → LOCKED → PROCESSED → PAID

side states: REJECTED | CANCELLED | REOPENED | ADJUSTED | REVERSED
```

* Transition rules enforced server-side; `LOCKED` and beyond are immutable.
* Corrections only via `payroll_adjustments` (arrears/recovery) or `reversals`.
* Configurable multi-level approval: Processor → HR Manager → Finance →
  Approver (`payroll_approvals` steps per org).
* **[PARTIAL]** `Payroll.status` already has draft/pending_approval/approved/
  processed/paid/cancelled/locked; the full transition table + immutability
  guards are **[NEW]**.

---

## 11. API Architecture

```text
/api/payroll-config/*        policies, components, statutory, tax, wage-defs, rules   [HAVE → extend]
/api/payroll/rules/*         CRUD + versions + publish + simulate                     [NEW]
/api/payroll/notifications/* government notification workflow                         [NEW]
/api/payroll/generate        single employee run                                      [HAVE]
/api/payroll/generate-all    bulk run (PayrollRun, background)                        [HAVE]
/api/payroll/runs/{id}       run status/progress                                      [HAVE]
/api/payroll/{id}/explain    explainability payload (lines + rule refs)               [NEW]
/api/payroll/simulate        what-if (no persistence)                                 [NEW]
/api/payroll/arrears/*       retro diffs, adjustments                                 [NEW]
/api/payroll/fnf/*           full & final                                             [PARTIAL]
/api/payroll/accounting/*    journal preview/commit                                   [PARTIAL]
/api/payroll/payments/*      batches, files, reconciliation                           [NEW]
/api/payroll/reports/*       statutory report definitions + exports                   [PARTIAL]
```

Conventions: tenant-scoped via existing ORM isolation listener; camelCase
wire format; `detail` + structured error envelope (both supported).

---

## 12. Security Model

* **Tenant isolation** — global read-scope listener + write-side org forcing
  **[HAVE]** (proven by isolation tests).
* **RBAC** — module/action permissions (`core/permissions.py`, dynamic
  permissions) **[HAVE]**; payroll-specific actions (process/approve/view-
  salary) map onto it.
* **Field-level** — PII/salary masking for non-HR roles **[HAVE]**; extend to
  payroll result fields (only own record for employees; approved roles for
  others).
* **Approval segregation** — preparer ≠ approver enforced in `payroll_approvals`.
* **Secrets/encryption** — env-based secrets **[HAVE]**; bank/statutory IDs
  masked at rest in exports; audit-immutable logs (§13).

---

## 13. Audit Architecture

Every payroll-affecting action writes an immutable row:

```text
user, timestamp, action, employee_id, payroll_id,
old_value(JSON), new_value(JSON), reason,
rule_id, rule_version, source_notification_id
```

Backed by the existing `AuditLog` (+ activity log) **[PARTIAL]**; payroll adds
rule-version references. No update/delete of audit rows; corrections append.

---

## 14. Testing Strategy

1. **Unit** — DSL evaluator, wage bases, each statutory calculator against
   rule fixtures.
2. **Golden scenarios** (§59) — table-driven library:
   `{profile, state, salary, attendance, leave, OT, regime, expected…}`.
   Every rule publish runs the library (mandate §60 Tests 1–7 as automated
   assertions: change tax rule → no code change; new rule version; new
   threshold = parameter; state rule = version; retro = auto arrears + audit;
   new regime = config; new scheme = config **or** explicit capability error).
3. **Property tests** — net = earnings − deductions; rounding reconciliation;
   determinism (same inputs → identical output across runs).
4. **Retro/edge** — mid-month join/exit, FY transition, leap year, zero
   attendance, negative adjustments, multiple corrections (most already in the
   94-test suite **[HAVE]**).
5. **Scale smoke** — 100k synthetic employees, batch run timing.

---

## 15. Sample Golden Scenarios (initial library)

| # | Scenario | Asserts |
|---|---|---|
| G1 | Karnataka monthly IT employee, ₹10L CTC, full attendance, old regime | gross, PF=12%/ceiling, PT=200, HRA exemption, TDS w/ cess |
| G2 | Maharashtra daily worker, ₹650/day, 24 days, 8 OT hours | wage = 650×24, OT=×2 on daily rate, LWF, PT slab |
| G3 | Tamil Nadu ESI-eligible worker, gross ≤ 21,000 | ESI 0.75/3.25 on ESI wages |
| G4 | Mid-month joiner (16th), Karnataka | pro-rated basic, PF/ESI on earned wages, PT monthly |
| G5 | Gov employee (pay level 6), DA revision effective retro (Apr, notified Aug) | arrears Apr–Jul, NPS, audit trail |
| G6 | Piece-rate worker, 1,200 units @ ₹12, slab incentive | units×rate + slab incentive + min-wage check |
| G7 | New-regime vs old-regime employee, same gross | regime switch = rule config only; both TDS correct |
| G8 | Bonus-eligible worker, gross ≤ 21,000, 8.33% minimum | bonus = statutory min/12 monthly |
| G9 | F&F: exit mid-month + leave encashment + loan recovery + gratuity | settlement total reconciles |
| G10 | Rule V1→V2 (PF 12%→13% hypothetically), retroactive | periods before use V1; arrears computed; no core change |

---

## Build Plan (incremental, per the mandate's order)

| Phase | Deliverable | Maps to spec |
|---|---|---|
| **P1** | **Rule Platform**: DSL evaluator, rule versioning/publish API, resolve trace, conflicts | §39-42, 60 |
| **P2** | **Wage Engine**: named wage bases, employment profiles, component applicability matrix | §3, 7, 8-10, 37 |
| **P3** | **Explainability**: `payroll_result_lines` + `/explain` | §43 |
| **P4** | **Statutory completions**: NPS/retirement, minimum wages, perquisites | §16, 22, 25 |
| **P5** | **Arrears + Retro engine**, salary-revision impact | §33, 34, 36 |
| **P6** | **Lifecycle + approvals + simulator + validation hardening** | §44-47 |
| **P7** | **F&F + gratuity settlement** | §23, 35 |
| **P8** | **Accounting + bank batches + reconciliation + year-end** | §48-53 |
| **P9** | **Sector profiles (Gov pay matrix, PSU, contract labour)** as data | §26-29 |
| **P10** | **Statutory reporting definitions + golden-suite automation** | §51, 58-60 |

Each phase ships with its golden scenarios and keeps the full suite green.
Existing behavior stays covered by the current 94 payroll tests throughout.
