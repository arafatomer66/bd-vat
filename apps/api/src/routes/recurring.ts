import { Router } from "express";
import { z } from "zod";
import { computeInvoice, type InvoiceLineInput } from "@bd-vat/vat-engine";
import { prisma } from "../prisma.js";
import { requireAuth, requireWriter } from "../middleware/auth.js";
import { postTransaction, postStock } from "../ledger/accounts.js";

export const recurringRouter = Router();
recurringRouter.use(requireAuth);

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  vatRate: z.number().min(0).max(1),
  sdRate: z.number().min(0).max(1).optional(),
});

const createSchema = z.object({
  kind: z.enum(["SALE", "PURCHASE"]).default("SALE"),
  partyId: z.string().optional(),
  dayOfMonth: z.number().int().min(1).max(28).default(1),
  lines: z.array(lineSchema).min(1),
  nextRunAt: z.coerce.date(),
});

recurringRouter.post("/", requireWriter, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const rec = await prisma.recurringInvoice.create({
    data: {
      tenantId: req.tenantId!,
      kind: parsed.data.kind,
      partyId: parsed.data.partyId,
      dayOfMonth: parsed.data.dayOfMonth,
      lines: JSON.stringify(parsed.data.lines),
      nextRunAt: parsed.data.nextRunAt,
    },
  });
  res.status(201).json(rec);
});

recurringRouter.get("/", async (req, res) => {
  const list = await prisma.recurringInvoice.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { nextRunAt: "asc" },
  });
  res.json(list);
});

// Generate transactions for every active template whose nextRunAt has passed, then
// advance nextRunAt by one month. Returns how many were generated.
recurringRouter.post("/run", requireWriter, async (req, res) => {
  const tenantId = req.tenantId!;
  const now = new Date();
  const due = await prisma.recurringInvoice.findMany({
    where: { tenantId, active: true, nextRunAt: { lte: now } },
  });

  let generated = 0;
  for (const rec of due) {
    const lines = JSON.parse(rec.lines) as InvoiceLineInput[];
    const totals = computeInvoice(lines);
    const txn = await prisma.transaction.create({
      data: {
        tenantId,
        kind: rec.kind,
        partyId: rec.partyId,
        status: "ISSUED",
        issuedAt: rec.nextRunAt,
        rebateEligible: rec.kind === "PURCHASE",
        netTotal: totals.netTotal,
        sdTotal: totals.sdTotal,
        vatTotal: totals.vatTotal,
        grandTotal: totals.grandTotal,
        lines: {
          create: totals.lines.map((l, i) => ({
            description: l.description,
            quantity: Number(lines[i]!.quantity),
            unitPrice: Number(lines[i]!.unitPrice),
            vatRate: Number(lines[i]!.vatRate),
            sdRate: Number(lines[i]!.sdRate ?? 0),
            netValue: l.netValue,
            sdAmount: l.sdAmount,
            vatAmount: l.vatAmount,
            lineTotal: l.lineTotal,
          })),
        },
      },
    });
    await postTransaction(tenantId, txn);
    await postStock(
      tenantId,
      txn,
      lines.map((l) => ({ description: l.description, quantity: Number(l.quantity) }))
    );
    const next = new Date(rec.nextRunAt);
    next.setUTCMonth(next.getUTCMonth() + 1);
    await prisma.recurringInvoice.update({ where: { id: rec.id }, data: { nextRunAt: next } });
    generated++;
  }
  res.json({ generated });
});
