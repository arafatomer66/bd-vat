#!/usr/bin/env node
/**
 * Sample e-commerce -> bd-vat order sync (e.g. for ShareDeal).
 *
 * Pulls completed orders from your store and pushes them to bd-vat's idempotent
 * order-ingest endpoint. Re-running is safe — orders already ingested are skipped
 * (deduped by orderId via the transaction's externalRef).
 *
 * Usage:
 *   BD_VAT_API=http://localhost:4000 \
 *   BD_VAT_TOKEN=<jwt> \
 *   node scripts/sharedeal-sync.mjs
 *
 * Replace `fetchStoreOrders()` with a real call to your store's API.
 */

const API = process.env.BD_VAT_API || "http://localhost:4000";
const TOKEN = process.env.BD_VAT_TOKEN;
if (!TOKEN) {
  console.error("Set BD_VAT_TOKEN (a bd-vat JWT). Get one from POST /api/auth/login.");
  process.exit(1);
}

/** Stub: return completed orders from your store. Map each order to the shape below. */
async function fetchStoreOrders() {
  return [
    {
      orderId: "SD-10001",
      issuedAt: "2026-06-15",
      customer: { name: "Rahim Store", bin: "0009876543210" },
      items: [
        { description: "Rice 5kg", quantity: 10, unitPrice: 350, vatRate: 0 }, // exempt food
        { description: "Delivery fee", quantity: 1, unitPrice: 60, vatRate: 0.15 },
      ],
    },
    {
      orderId: "SD-10002",
      issuedAt: "2026-06-16",
      customer: { name: "Karim Mart" },
      items: [{ description: "Cooking oil 2L", quantity: 5, unitPrice: 400, vatRate: 0.05 }],
    },
  ];
}

async function main() {
  const orders = await fetchStoreOrders();
  const res = await fetch(`${API}/api/integrations/orders`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ orders }),
  });
  if (!res.ok) {
    console.error("Sync failed:", res.status, await res.text());
    process.exit(1);
  }
  const result = await res.json();
  console.log(`Synced: ${result.created} created, ${result.skipped} already present (of ${result.total}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
