# NBR Software Enlistment — Readiness Notes

> Not legal advice. NBR rules change; confirm specifics with an NBR-registered VAT
> consultant before relying on this. This document tracks what bd-vat does to be
> *enlistment-ready* and what remains a business/regulatory step outside the code.

## Why enlistment matters
Under **General Order 16/Mushak/2019**, a business whose annual turnover exceeds
**BDT 5 crore** must keep VAT records using an **NBR-enlisted** digital software. So to
sell bd-vat to larger businesses, the software (and/or the vendor) needs NBR enlistment.
This is an application/approval process with NBR — **it cannot be satisfied by code alone**.

## What bd-vat already provides (engineering readiness)
- ✅ Mushak **6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.10, 9.1** and **4.3**, **2.1**
- ✅ Correct VAT/SD math (15% + truncated rates), input rebate, VDS, adjustments,
  carry-forward — engine unit-tested
- ✅ Double-entry general ledger, trial balance, P&L, balance sheet
- ✅ Stock-in/stock-out ledger (NBR expects a stock trail)
- ✅ Append-only **audit log** of significant actions
- ✅ Per-period **registers (6.1/6.2)** and **9.1** return with treasury-challan reconciliation
- ✅ Submission-ready **NBR package** behind a swappable adapter
- ✅ Tenant data **backup/export** (JSON)

## Gaps that are regulatory / external (not code)
- ⬜ **NBR enlistment application** — submit the software for NBR review/approval.
- ⬜ **EFD/SDC certification** — fiscal receipts must be issued by NBR-approved devices.
  The `FiscalDeviceAdapter` is the integration point; the device/PKI approval is external.
- ⬜ **a-Challan / IVAS portal** — no public API; the `ChallanAdapter` / `NbrAdapter`
  are the drop-in points if/when NBR grants programmatic access.

## Pre-application checklist
- [ ] Company registered; software vendor entity identified for the application
- [ ] Demonstrate generation of each required Mushak form to an NBR officer
- [ ] Show audit trail + data retention (records kept ≥ the statutory period)
- [ ] Show stock ledger and double-entry books reconcile to the VAT return
- [ ] EFD/SDC plan (which approved device/vendor) for retail / D2C e-commerce
- [ ] Data-security review (auth, role-based access, backups) — partially in place
- [ ] Engage an NBR-registered consultant to file the enlistment application
