# bd-vat — End-to-end Walkthrough

A complete worked example for one company, one tax period: **Selefe Trading Ltd., June 2026**.
You'll create a company, record a sale and a purchase, add a VDS certificate, compile the
**Mushak 9.1** return, reconcile a challan, and export the invoice, return and registers.

Both paths are shown: **A) the UI** and **B) `curl`**. The numbers are identical because the
API and the UI share the same `@bd-vat/vat-engine`.

## The scenario & expected numbers

| Item | Qty | Unit price | Net | VAT @15% | Total |
|------|----:|-----------:|----:|---------:|------:|
| **Sale** — finished goods | 100 | 1,000 | 100,000 | **15,000** | 115,000 |
| **Purchase** — raw materials (rebate-eligible) | 60 | 1,000 | 60,000 | **9,000** | 69,000 |

Mushak 9.1 for the period:

```
Output VAT                 15,000
Input VAT rebate         −  9,000
─────────────────────────────────
Net VAT payable           6,000
```

Add a **VDS certificate of 5,000 withheld on our sale**, and the net payable drops:

```
Output VAT                 15,000
Input VAT rebate         −  9,000
VDS withheld on sales    −  5,000
─────────────────────────────────
Net VAT payable           1,000
```

---

## Prerequisites

```bash
cd ~/Desktop/bd-vat
npm install
npm run db:up                                   # Postgres 16 on :5439 (needs Docker)
cp apps/api/.env.example apps/api/.env
npm run prisma:migrate -w @bd-vat/api -- --name init
npm run dev:api                                 # http://localhost:4000
# (for path A) in a second terminal:
npm run dev:web                                 # http://localhost:4200
```

---

## A) UI walkthrough (http://localhost:4200)

1. **Create the company.** At `/login`, click *Create a company*. Enter company name
   `Selefe Trading Ltd.`, BIN `0001234567890`, your email and a password (≥8 chars). You land
   on the **Dashboard** as OWNER.
2. **Record the sale.** Go to **Transactions** → type *Sale*, date in June 2026, add a line
   `Finished goods`, qty `100`, unit price `1000`, VAT `15%`. The live preview shows VAT
   **15,000**, total **115,000**. Save. (It's auto-numbered `6.3-2026-0001`.)
3. **Download the tax invoice.** In the recent-transactions list, click **Mushak 6.3 PDF** on
   the sale row — the invoice opens as a PDF.
4. **Record the purchase.** New transaction → *Purchase*, line `Raw materials`, qty `60`, unit
   price `1000`, VAT `15%`. Save (VAT 9,000).
5. **Add the VDS certificate.** Go to **VDS & Notes** → VDS card → certificate no. `VDS-001`,
   direction *Withheld on our sales*, amount `5000`, save.
6. **Compile the return.** Go to **Returns**, set month `6`, year `2026`, click **Compile**.
   The detail panel shows Output 15,000, rebate 9,000, VDS 5,000, **Net payable 1,000**.
7. **File & reconcile.** Click **Finalise**, then enter a treasury challan (no. `CH-001`,
   deposit `1000`) and **Save challan**. Click **Mark submitted**.
8. **Export.** From the detail panel grab the **Mushak 9.1 PDF**, the **6.2 sales CSV** /
   **6.1 purchase CSV**, and the **NBR package (JSON)**. **Submit to NBR** returns the manual
   filing guidance.
9. **Check the dashboard.** Back on **Dashboard**: the deadline alert (due 15 Jul 2026), the
   output-vs-input bar for 2026-06, and the VDS-receivable card all reflect the above.

---

## B) `curl` walkthrough

Uses `jq` to capture the token and IDs. Run top to bottom.

```bash
API=http://localhost:4000

# 1. Sign up -> capture JWT
TOKEN=$(curl -s -X POST $API/api/auth/signup \
  -H 'content-type: application/json' \
  -d '{"companyName":"Selefe Trading Ltd.","bin":"0001234567890",
       "email":"owner@selefe.test","password":"Password123"}' | jq -r .token)
AUTH="authorization: Bearer $TOKEN"

# 2. Record the SALE (auto-numbered 6.3-2026-0001)
SALE=$(curl -s -X POST $API/api/transactions -H "$AUTH" -H 'content-type: application/json' \
  -d '{"kind":"SALE","issuedAt":"2026-06-05",
       "lines":[{"description":"Finished goods","quantity":100,"unitPrice":1000,"vatRate":0.15}]}')
echo "$SALE" | jq '{no:.mushakNo, vat:.vatTotal, total:.grandTotal}'
#   => { "no": "6.3-2026-0001", "vat": "15000.00", "total": "115000.00" }
SALE_ID=$(echo "$SALE" | jq -r .id)

# 3. Download the Mushak 6.3 tax invoice PDF
curl -s -H "$AUTH" $API/api/transactions/$SALE_ID/mushak-6.3 -o mushak-6.3.pdf
echo "saved $(ls -la mushak-6.3.pdf | awk '{print $5}') bytes"

# 4. Record the PURCHASE (rebate-eligible)
curl -s -X POST $API/api/transactions -H "$AUTH" -H 'content-type: application/json' \
  -d '{"kind":"PURCHASE","issuedAt":"2026-06-03","rebateEligible":true,
       "lines":[{"description":"Raw materials","quantity":60,"unitPrice":1000,"vatRate":0.15}]}' \
  | jq '{vat:.vatTotal}'      # => { "vat": "9000.00" }

# 5. VDS certificate: 5,000 withheld on our sales
curl -s -X POST $API/api/vds -H "$AUTH" -H 'content-type: application/json' \
  -d '{"certificateNo":"VDS-001","withheldOnOurSales":true,"amount":5000,"issuedAt":"2026-06-20"}' \
  > /dev/null

# 6. Compile the Mushak 9.1 for 2026-06
RET=$(curl -s -X POST $API/api/returns/compile -H "$AUTH" -H 'content-type: application/json' \
  -d '{"year":2026,"month":6}')
echo "$RET" | jq '.computed | {output:.totalOutputTax, credits:.totalRebateAndCredits, payable:.netPayable}'
#   => { "output": "15000.00", "credits": "14000.00", "payable": "1000.00" }
RET_ID=$(echo "$RET" | jq -r .return.id)

# 7. Finalise -> challan -> submit
curl -s -X PATCH $API/api/returns/$RET_ID/status  -H "$AUTH" -H 'content-type: application/json' \
  -d '{"status":"FINALISED"}' > /dev/null
curl -s -X PATCH $API/api/returns/$RET_ID/challan -H "$AUTH" -H 'content-type: application/json' \
  -d '{"challanNo":"CH-001","treasuryDeposits":1000}' | jq '.computed.netPayable'   # => "0.00"
curl -s -X PATCH $API/api/returns/$RET_ID/status  -H "$AUTH" -H 'content-type: application/json' \
  -d '{"status":"SUBMITTED"}' | jq '{status:.status, submittedAt:.submittedAt}'

# 8. Exports
curl -s -H "$AUTH" $API/api/returns/$RET_ID/mushak-9.1 -o mushak-9.1.pdf
curl -s -H "$AUTH" "$API/api/returns/registers?type=6.2&year=2026&month=6" -o sales-register-6.2.csv
curl -s -H "$AUTH" $API/api/returns/$RET_ID/nbr-package -o nbr-9.1-2026-6.json

# 9. Dashboard summary
curl -s -H "$AUTH" $API/api/dashboard/summary \
  | jq '{deadline:.deadline, vdsReceivable:.vds.receivable, june:.months}'
```

After step 7 the challan deposit of 1,000 covers the 1,000 payable, so net payable settles to
**0.00**. The NBR package (`nbr-9.1-2026-6.json`) is the submission-ready bundle: company,
period, all 9.1 figures, and the 6.1/6.2 register rows.

---

## Notes
- **Roles:** the owner created at signup is OWNER (can write). Add an ACCOUNTANT via
  `POST /api/auth/users`; a VIEWER gets `403` on any write.
- **Idempotent compile:** re-running step 6 updates the same DRAFT return for the period.
- **Carry-forward:** if a period's credits exceed output tax, the surplus appears as
  `carryForward` and becomes the next period's `openingRebateBalance` automatically.
