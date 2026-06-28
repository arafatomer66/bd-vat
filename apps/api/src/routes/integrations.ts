import { Router } from "express";
import { z } from "zod";
import { computeInvoice, type InvoiceLineInput } from "@bd-vat/vat-engine";
import { isValidBin } from "@bd-vat/shared";
import { prisma } from "../prisma.js";
import { requireAuth, requireWriter } from "../middleware/auth.js";
import { postTransaction, postStock } from "../ledger/accounts.js";

export const integrationsRouter = Router();
integrationsRouter.use(requireAuth);

const itemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  vatRate: z.number().min(0).max(1).default(0.15),
  sdRate: z.number().min(0).max(1).optional(),
});

const orderSchema = z.object({
  orderId: z.string().min(1),
  issuedAt: z.coerce.date(),
  customer: z.object({ name: z.string().optional(), bin: z.string().optional() }).optional(),
  items: z.array(itemSchema).min(1),
});

const ingestSchema = z.object({ orders: z.array(orderSchema).min(1).max(1000) });

/**
 * E-commerce order-sync: ingest completed orders as SALE transactions.
 * Idempotent per (tenant, orderId) via externalRef, so re-sending is safe. Each order
 * is VAT-computed by the engine, posted to the ledger and stock, and linked to a party.
 */
integrationsRouter.post("/orders", requireWriter, async (req, res) => {
  const parsed = ingestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const tenantId = req.tenantId!;

  let created = 0;
  let skipped = 0;
  for (const order of parsed.data.orders) {
    const existing = await prisma.transaction.findUnique({
      where: { tenantId_externalRef: { tenantId, externalRef: order.orderId } },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const partyId = await resolveParty(tenantId, order.customer);
    const totals = computeInvoice(order.items as InvoiceLineInput[]);
    const txn = await prisma.transaction.create({
      data: {
        tenantId,
        kind: "SALE",
        status: "ISSUED",
        partyId,
        externalRef: order.orderId,
        mushakNo: `EC-${order.orderId}`,
        issuedAt: order.issuedAt,
        netTotal: totals.netTotal,
        sdTotal: totals.sdTotal,
        vatTotal: totals.vatTotal,
        grandTotal: totals.grandTotal,
        lines: {
          create: totals.lines.map((l, i) => ({
            description: l.description,
            quantity: order.items[i]!.quantity,
            unitPrice: order.items[i]!.unitPrice,
            vatRate: order.items[i]!.vatRate,
            sdRate: order.items[i]!.sdRate ?? 0,
            netValue: l.netValue,
            sdAmount: l.sdAmount,
            vatAmount: l.vatAmount,
            lineTotal: l.lineTotal,
          })),
        },
      },
    });
    await postTransaction(tenantId, txn);
    await postStock(tenantId, txn, order.items.map((i) => ({ description: i.description, quantity: i.quantity })));
    created++;
  }

  res.status(201).json({ created, skipped, total: parsed.data.orders.length });
});

async function resolveParty(
  tenantId: string,
  customer?: { name?: string; bin?: string }
): Promise<string | undefined> {
  if (!customer?.name && !customer?.bin) return undefined;
  const bin = customer.bin && isValidBin(customer.bin) ? customer.bin : undefined;
  const found = await prisma.party.findFirst({
    where: { tenantId, ...(bin ? { bin } : { name: customer.name }) },
  });
  if (found) return found.id;
  const party = await prisma.party.create({
    data: { tenantId, name: customer.name ?? "E-commerce customer", bin, type: "CUSTOMER" },
  });
  return party.id;
}
