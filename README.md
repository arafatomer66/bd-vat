# bd-vat — Bangladesh VAT Management System

VAT management for Bangladesh under the **Value Added Tax and Supplementary Duty Act, 2012**
(NBR / Mushak regime). Multi-tenant foundation, built for **SME self-filing** first.

> **NBR integration note:** NBR's online VAT portal (IVAS / `vat.gov.bd`) does not expose a
> public third-party API. This system is architected to make you *submission-ready* — compliant
> Mushak forms and a correctly computed **Mushak 9.1** return — behind an `NbrAdapter` boundary
> that real portal/API automation slots into when access exists.

## Stack
- **apps/web** — Angular 20 (accountant workspace)
- **apps/api** — Express + TypeScript + Prisma
- **packages/vat-engine** — pure, unit-tested tax math (15% + truncated rates, SD, rebate, VDS, Mushak 9.1)
- **packages/shared** — BIN/TIN validation, VAT rate constants, shared types
- **PostgreSQL 16** (docker-compose, port `5439`)

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
| POST   | `/api/companies`             | Onboard a company (BIN-validated)        |
| POST   | `/api/transactions`          | Create a SALE (Mushak 6.3) or PURCHASE   |
| GET    | `/api/transactions?kind=`    | List transactions                        |
| POST   | `/api/returns/compile`       | Compile Mushak 9.1 for `{year, month}`   |
| GET    | `/api/returns`               | List compiled returns                    |

## Roadmap
1. **Foundation** ✅ monorepo, Prisma model, vat-engine, API skeleton, Angular shell
2. Transactions UI + Mushak 6.3 PDF invoice
3. Full `vat-engine` coverage (VDS, SD, adjustments) — *core trust layer*
4. Mushak 9.1 return + 6.1/6.2 registers + dashboard (payable, deadlines)
5. `NbrAdapter` — submission-ready package + portal automation hook
