# bd-vat — Bangladesh VAT Management System

VAT management for Bangladesh under the **Value Added Tax and Supplementary Duty Act, 2012**
(NBR / Mushak regime). Multi-tenant foundation, built for **SME self-filing** first — each
tenant is one VAT-registered company (one BIN).

> **NBR integration note:** NBR's online VAT portal (IVAS / `vat.gov.bd`) does not expose a
> public third-party API. This system is architected to make you *submission-ready* — compliant
> Mushak forms and a correctly computed **Mushak 9.1** return — behind an `NbrAdapter` boundary
> that real portal/API automation slots into when access exists.

## Stack
- **apps/web** — Angular 20 (standalone components + signals) accountant workspace
- **apps/api** — Express + TypeScript + Prisma REST API
- **packages/vat-engine** — pure, unit-tested tax math (decimal.js) — the trust core
- **packages/shared** — BIN/TIN validation, VAT rate constants, shared types
- **PostgreSQL 16** via docker-compose (port `5439`)

---

## Features

Legend: ✅ shipped (Phase 1) · 🟡 partial / engine-ready, UI pending · ⬜ planned

### Company & tax registration
- ✅ Multi-tenant — one tenant per VAT-registered company (BIN-isolated data)
- ✅ Company onboarding with **13-digit BIN** validation
- ✅ **12-digit e-TIN** capture & validation
- ✅ NBR jurisdiction fields — Commissionerate / Division / Circle, economic activity
- ⬜ User accounts & roles (Owner / Accountant / Viewer) with JWT auth
- ⬜ Multi-company switching for accounting-firm mode

### Master data
- ✅ Products / services with per-item **VAT rate** and **Supplementary Duty (SD) rate**
- ✅ HS code & unit of measure on products
- ✅ Parties (customers / suppliers) with counterparty BIN for B2B input rebate
- ⬜ Bulk import of products & parties (CSV/Excel)

### VAT calculation engine (`packages/vat-engine`, fully unit-tested)
- ✅ **Standard 15% VAT** on taxable supplies
- ✅ **Truncated / reduced rates** (1.5%, 2.5%, 5%, 7.5%, 10%, 0%) per item
- ✅ **Supplementary Duty (SD)** layered correctly — VAT charged on (value + SD)
- ✅ Decimal-precise money math (no float drift), half-up poisha rounding
- ✅ Per-line and whole-invoice totals (net / SD / VAT / grand total)
- ✅ **Input VAT rebate** computation
- ✅ **VAT Deducted at Source (VDS)** handling
- ✅ Increasing / decreasing **adjustments**
- ✅ Opening-balance **carry-forward** of surplus rebate between periods

### Transactions & invoicing
- ✅ Record **SALES** (output VAT) and **PURCHASES** (input VAT) with line items
- ✅ Automatic VAT/SD computation on every transaction via the engine
- ✅ Rebate-eligibility flag on purchases
- ✅ List & filter transactions by type
- 🟡 **Mushak 6.3** tax invoice (chalan) — data model ready, PDF generation pending
- ⬜ Mushak 6.3 PDF export & print
- ⬜ Mushak 6.7 (credit note) / 6.8 (debit note) issuance UI
- ⬜ Mushak 6.6 (VDS certificate) issuance & tracking UI
- ⬜ Invoice numbering sequences per company

### Returns & registers
- ✅ **Mushak 9.1** monthly return auto-compiled from the period's transactions
- ✅ Net payable / carry-forward computed; draft return upserted per period
- ✅ Return listing across periods
- ✅ Previous-period rebate balance pulled forward automatically
- 🟡 Return finalise / submit workflow (status model present)
- ⬜ **Mushak 6.1** purchase register & **6.2** sales register exports
- ⬜ Mushak 9.1 official-layout PDF
- ⬜ Treasury challan (payment) reconciliation

### Dashboard & reporting
- ✅ Dashboard shell with API health, rate/deadline summary cards, compiled-returns table
- ⬜ Net-payable & filing-deadline alerts (return due by the **15th** of the following month)
- ⬜ Output vs input VAT trends, period comparisons
- ⬜ VDS receivable/payable summary

### NBR compliance & integration
- ✅ Domain modelled to the SD&VAT Act 2012 / Mushak forms
- ⬜ `NbrAdapter` — submission-ready export package
- ⬜ Online return submission / IVAS-style portal automation (when access exists)

### Platform
- ✅ npm-workspaces monorepo, shared TS config
- ✅ Dockerised Postgres + Prisma migrations + seed data
- ✅ Tenant-scoped API (`x-tenant-id` header in Phase 1)
- ⬜ JWT auth, audit log, role-based authorization
- ⬜ CI (build + test), deployment

---

## Quick start
```bash
npm install                      # install all workspaces
npm run test                     # run the vat-engine test suite (no DB needed)

npm run db:up                    # start Postgres in Docker
cp apps/api/.env.example apps/api/.env
npm run prisma:migrate -w @bd-vat/api -- --name init
npm run db:seed -w @bd-vat/api   # demo company + transactions

npm run dev:api                  # API on http://localhost:4000
npm run dev:web                  # Angular on http://localhost:4200
```

## API (Phase 1)
Tenant scope is provided via the `x-tenant-id` header (JWT auth lands in Phase 1.5).

| Method | Path                         | Purpose                                  |
|--------|------------------------------|------------------------------------------|
| GET    | `/health`                    | Service health                           |
| POST   | `/api/companies`             | Onboard a company (BIN-validated)        |
| GET    | `/api/companies/:id`         | Get a company                            |
| POST   | `/api/transactions`          | Create a SALE (Mushak 6.3) or PURCHASE   |
| GET    | `/api/transactions?kind=`    | List transactions                        |
| POST   | `/api/returns/compile`       | Compile Mushak 9.1 for `{year, month}`   |
| GET    | `/api/returns`               | List compiled returns                    |

## Roadmap
1. **Foundation** ✅ monorepo, Prisma model, vat-engine, API skeleton, Angular shell
2. Transactions UI + Mushak 6.3 PDF invoice
3. Full `vat-engine` wiring (VDS, SD, adjustments end-to-end) — *core trust layer*
4. Mushak 9.1 return + 6.1/6.2 registers + dashboard (payable, deadlines)
5. `NbrAdapter` — submission-ready package + portal automation hook
