# bd-vat — Detailed Feature Reference

Every shipped feature, what it does, the Mushak form / NBR rule it implements, the API
surface, and where it lives in the Angular app. Legend: ✅ shipped · ⬜ planned.

Statutory basis throughout: **Value Added Tax and Supplementary Duty Act, 2012** and the
**VAT and SD Rules, 2016**, administered by the National Board of Revenue (NBR).

---

## 1. Company & tax registration

### ✅ Multi-tenant company onboarding
Each tenant is exactly one VAT-registered company. All data (transactions, returns, parties,
products, audit) is partitioned by `tenantId`, which is derived from the auth token — never
from client input — so one company can never read another's data.
- **API:** `POST /api/auth/signup` creates the `Tenant` + first `OWNER` user atomically.
- **UI:** signup form at `/login` (toggle to "Create a company").

### ✅ BIN validation (13-digit)
The Business Identification Number issued by NBR on VAT registration is validated for format
(13 digits, spaces/dashes normalised) before a company or counterparty is saved.
- **Code:** `@bd-vat/shared` → `isValidBin()`, `normalizeBin()`.

### ✅ e-TIN validation (12-digit)
Optional Taxpayer Identification Number captured on the company and validated to 12 digits.
- **Code:** `@bd-vat/shared` → `isValidTin()`.

### ✅ NBR jurisdiction fields
Commissionerate, Division, Circle and economic-activity fields are modelled on the company so
returns and invoices can reference the correct VAT office.
- **Schema:** `Tenant.commissionerate / division / circle / economicActivity`.

### ✅ Users & roles (OWNER / ACCOUNTANT / VIEWER)
Three roles. OWNER manages users and company; OWNER + ACCOUNTANT can write (create
transactions, notes, returns); VIEWER is strictly read-only. Enforced server-side on every
mutating route, not just hidden in the UI.
- **API:** `POST /api/auth/users` (OWNER only), `GET /api/auth/users`.
- **Middleware:** `requireAuth`, `requireRole(...)`, `requireWriter`.

### ✅ Multi-company switching (accounting-firm mode)
A user can belong to several companies via a `Membership` join (their home tenant is an
implicit membership). Switching re-issues a JWT scoped to the chosen tenant and its role,
so a firm's accountant works each client with the correct permissions.
- **API:** `GET /api/auth/memberships`, `POST /api/auth/switch`, `POST /api/auth/memberships`
  (OWNER attaches an existing user by email).
- **UI:** company dropdown in the top bar (appears only when >1 company).

---

## 2. Master data

### ✅ Products & services with VAT/SD rates
Each product carries its own VAT rate and Supplementary Duty rate (so truncated-rate and
SD-liable goods are modelled correctly), plus unit and HS code.
- **API:** `GET /api/products`, `POST /api/products`.
- **UI:** `/master-data` → Products card.

### ✅ Parties (customers & suppliers)
Counterparties with name, type (CUSTOMER / SUPPLIER / BOTH), address and **counterparty BIN**
— the BIN is what makes a B2B purchase eligible for input-tax rebate.
- **API:** `GET /api/parties`, `POST /api/parties`; quick-add also lives inside the
  transaction form.

### ✅ CSV bulk import (products & parties)
Upload a CSV of products or parties. The parser is quoted-field aware (handles commas and
newlines inside quotes, escaped `""`), maps headers case-insensitively, validates each row,
and bulk-inserts. Invalid/empty rows are dropped with a count reported back.
- **API:** `POST /api/products/import`, `POST /api/parties/import` (row arrays, ≤2000).
- **UI:** `/master-data` → "Import …CSV" file pickers.
- **Columns:** products `name, unit, hsCode, vatRate, sdRate`; parties `name, bin, type, address`.

---

## 3. VAT calculation engine (`@bd-vat/vat-engine`)

A pure, dependency-light TypeScript package — **the trust core**. All money runs through
`decimal.js` (no binary-float drift), rounded half-up to 2 decimal places (poisha). Fully
unit-tested (invoice math, return math, BIN — 11 tests) and reused identically by the API.

### ✅ Standard 15% VAT
The default output-tax rate on taxable supplies.

### ✅ Truncated / reduced rates
Per-item rates of 1.5%, 2.5%, 5%, 7.5%, 10% and 0% for designated goods/services, alongside
the 15% standard rate.
- **Code:** `KNOWN_VAT_RATES`, `STANDARD_VAT_RATE`.

### ✅ Supplementary Duty layered correctly
For SD-liable items, SD is charged on the value and **VAT is then charged on (value + SD)** —
the layering the Act prescribes. Verified by test.
- **Code:** `computeInvoiceLine()` / `computeInvoice()`.

### ✅ Input VAT rebate
Input tax on rebate-eligible purchases reduces the net payable (a decreasing element of the
9.1). Only purchases flagged rebate-eligible (valid tax invoice, conditions met) are counted.

### ✅ VAT Deducted at Source (VDS)
VDS withheld on the taxpayer's own sales is deposited by the withholder, so it reduces what
the taxpayer remits directly; VDS the taxpayer withholds on purchases is tracked separately.

### ✅ Increasing / decreasing adjustments
Debit notes increase, credit notes decrease the period's net VAT.

### ✅ Carry-forward of surplus rebate
When credits exceed output tax, the surplus is carried forward as next period's opening
rebate balance instead of going negative. Verified by test.
- **Code:** `computeReturn()` → `netPayable` / `carryForward`.

---

## 4. Transactions & invoicing

### ✅ Sales & purchases with line items
Record SALES (output VAT) and PURCHASES (input VAT), each with multiple lines; totals
(net / SD / VAT / grand) are computed by the engine at save time, never trusted from the client.
- **API:** `POST /api/transactions`, `GET /api/transactions?kind=SALE|PURCHASE`.
- **UI:** `/transactions` — reactive form with **live VAT/SD preview** as you type.

### ✅ Rebate-eligibility flag
Purchases default to rebate-eligible; the flag controls whether their input VAT feeds the 9.1
rebate total.

### ✅ Automatic invoice numbering
Sales without a supplied number get `6.3-YYYY-NNNN`, sequential per company per year;
purchases keep the supplier's reference.

### ✅ Mushak 6.3 — Tax Invoice (PDF)
A compliant-style tax invoice (চালানপত্র, Rule 40) rendered to a downloadable A4 PDF: seller
& buyer blocks with BINs, line table with per-line VAT and rate, and net/SD/VAT/grand totals.
- **API:** `GET /api/transactions/:id/mushak-6.3` (streams `application/pdf`).
- **UI:** "Mushak 6.3 PDF" button per sale row.

### ✅ Mushak 6.6 — VDS certificate
Record a VAT-Deducted-at-Source certificate, marking whether VAT was withheld **on our sales**
(reduces our payable) or **by us on a purchase** (we deposit). Feeds the 9.1 and the dashboard
VDS summary.
- **API:** `GET /api/vds`, `POST /api/vds`.
- **UI:** `/adjustments` → VDS card.

### ✅ Mushak 6.7 / 6.8 — Credit / Debit notes
Issue a credit note (decreasing adjustment) or debit note (increasing adjustment) with number,
reason and VAT amount; the Mushak form is inferred from direction. Both flow into the 9.1.
- **API:** `GET /api/adjustments`, `POST /api/adjustments`.
- **UI:** `/adjustments` → Notes card.

---

## 5. Returns & registers

### ✅ Mushak 9.1 — monthly return auto-compile
Compiling a period aggregates issued sales (output VAT + SD), rebate-eligible purchases (input
VAT), VDS-on-sales, credit/debit-note adjustments and the prior period's carry-forward, runs
the engine, and upserts a DRAFT return — recompiling is idempotent.
- **API:** `POST /api/returns/compile` `{ year, month }`, `GET /api/returns`, `GET /api/returns/:id`.
- **UI:** `/returns` — compile a period, then a detail panel with every 9.1 figure.

### ✅ Filing workflow (DRAFT → FINALISED → SUBMITTED)
Move a return through its lifecycle; SUBMITTED stamps a timestamp. Each transition is audited.
- **API:** `PATCH /api/returns/:id/status`.

### ✅ Treasury challan reconciliation
Record the a-Challan number and deposit amount against a return; net payable and carry-forward
are recomputed from the stored figures so the return reflects the payment.
- **API:** `PATCH /api/returns/:id/challan`.

### ✅ Mushak 9.1 return PDF
The whole return as a PDF: total output tax (A), total rebate & credits (B), deposits, net
payable, carry-forward, and challan reference. *(Simplified layout; exact gazette layout is a
later polish.)*
- **API:** `GET /api/returns/:id/mushak-9.1`.

### ✅ Mushak 6.1 / 6.2 register CSV
Export the purchase register (6.1) or sales register (6.2) for a period — one row per
transaction with party, BIN and amounts — as CSV for spreadsheet use or NBR upload.
- **API:** `GET /api/returns/registers?type=6.1|6.2&year=&month=`.
- **UI:** "6.1 / 6.2 CSV" buttons on the return detail.

---

## 6. Dashboard & reporting

### ✅ Filing-deadline alert
Shows the most recently closed period and its due date (the **15th** of the following month),
days remaining, and whether it's been submitted — colour-coded ok / warning / overdue.

### ✅ Output vs input VAT trend
A 6-month bar chart of output VAT vs input VAT per month, with net per month.

### ✅ VDS receivable / payable summary
Cards totalling VDS withheld on our sales (receivable) vs VDS we withheld on purchases (payable).
- **API (all three):** `GET /api/dashboard/summary`.
- **UI:** `/` (Dashboard).

---

## 7. NBR compliance & integration

### ✅ Mushak-accurate domain model
The schema and engine follow the SD&VAT Act 2012 / Mushak form structure end to end.

### ✅ `NbrAdapter` boundary + submission-ready package
A clean integration seam. `buildNbrPackage()` bundles the 9.1 figures plus the 6.1/6.2 register
rows into a versioned JSON package. The default `ManualNbrAdapter` validates completeness (e.g.
refuses if VAT is payable but no challan is recorded) and returns filing guidance.
- **API:** `GET /api/returns/:id/nbr-package` (JSON download), `POST /api/returns/:id/nbr-submit`.
- **UI:** "NBR package (JSON)" + "Submit to NBR" on the return detail.

### ⬜ Online return submission / IVAS portal automation
**Blocked:** NBR's IVAS portal (vat.gov.bd) exposes no public third-party API. The boundary
above is the drop-in point — implement `IvasNbrAdapter` behind the same interface, no caller
changes, once portal/API access exists.

---

## 8. Platform & security

### ✅ JWT authentication
Signup/login issue a 7-day JWT carrying `{ userId, tenantId, role }`; `requireAuth` verifies it
and derives tenant scope from it. Passwords hashed with bcrypt.
- **API:** `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`.
- **Web:** token in `localStorage`, attached by an HTTP interceptor; a route guard redirects to
  `/login` when unauthenticated.

### ✅ Role-based authorization
Writes gated to OWNER/ACCOUNTANT; VIEWER read-only — enforced on the server.

### ✅ Append-only audit log
Significant actions (transaction.create, return status/challan/nbr-submit, user/membership
changes, imports) are recorded per tenant. Fire-and-forget — auditing never breaks a request.
- **API:** `GET /api/auth/audit`.

### ✅ Monorepo, Postgres, CI
npm-workspaces monorepo; Dockerised Postgres 16 with Prisma migrations + seed; GitHub Actions CI
builds every workspace and runs the engine tests on each push/PR.

### ⬜ Deployment
Not yet set up (infra task, not a feature).

---

## Known quality caveats (not missing features)
- **PDF Bengali text is romanised** — PDFKit's built-in fonts can't render Bengali Unicode;
  embed a Bengali TTF to print Mushak labels natively.
- **No live DB round-trip yet** — verification to date is builds + engine tests + standalone
  PDF/JWT/CSV checks + green CI; treat the first `db:up && dev:api` as a smoke test.
