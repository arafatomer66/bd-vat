import { Router } from "express";
import { z } from "zod";
import { computeInvoice, type InvoiceLineInput } from "@bd-vat/vat-engine";
import { prisma } from "../prisma.js";
import { requireAuth, requireWriter } from "../middleware/auth.js";
import { audit } from "../audit.js";
import { postTransaction, postStock } from "../ledger/accounts.js";
import { getFiscalAdapter } from "../integrations/efd.js";
import { getNotificationAdapter } from "../integrations/notify.js";
import { renderMushak63 } from "../mushak/mushak63.js";

export const transactionsRouter = Router();
transactionsRouter.use(requireAuth);

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  vatRate: z.number().min(0).max(1),
  sdRate: z.number().min(0).max(1).optional(),
});

const createTxnSchema = z.object({
  kind: z.enum(["SALE", "PURCHASE"]),
  partyId: z.string().optional(),
  mushakNo: z.string().optional(),
  issuedAt: z.coerce.date(),
  rebateEligible: z.boolean().optional(),
  lines: z.array(lineSchema).min(1),
});

// Create a SALE (Mushak 6.3) or PURCHASE; totals computed by the VAT engine.
transactionsRouter.post("/", requireWriter, async (req, res) => {
  const parsed = createTxnSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { lines, ...header } = parsed.data;
  const totals = computeInvoice(lines as InvoiceLineInput[]);

  // Auto-number sales invoices per company per year when no number is supplied:
  // 6.3-YYYY-NNNN. Purchases keep the supplier's reference.
  let mushakNo = header.mushakNo;
  if (!mushakNo && header.kind === "SALE") {
    const year = header.issuedAt.getUTCFullYear();
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
    const count = await prisma.transaction.count({
      where: { tenantId: req.tenantId!, kind: "SALE", issuedAt: { gte: yearStart, lt: yearEnd } },
    });
    mushakNo = `6.3-${year}-${String(count + 1).padStart(4, "0")}`;
  }

  const txn = await prisma.transaction.create({
    data: {
      tenantId: req.tenantId!,
      kind: header.kind,
      partyId: header.partyId,
      mushakNo,
      issuedAt: header.issuedAt,
      rebateEligible: header.rebateEligible ?? header.kind === "PURCHASE",
      status: "ISSUED",
      netTotal: totals.netTotal,
      sdTotal: totals.sdTotal,
      vatTotal: totals.vatTotal,
      grandTotal: totals.grandTotal,
      lines: {
        create: totals.lines.map((l, i) => ({
          description: l.description,
          quantity: lines[i]!.quantity,
          unitPrice: lines[i]!.unitPrice,
          vatRate: lines[i]!.vatRate,
          sdRate: lines[i]!.sdRate ?? 0,
          netValue: l.netValue,
          sdAmount: l.sdAmount,
          vatAmount: l.vatAmount,
          lineTotal: l.lineTotal,
        })),
      },
    },
    include: { lines: true },
  });

  // Post to the general ledger (double-entry) and the stock ledger.
  await postTransaction(req.tenantId!, txn);
  await postStock(req.tenantId!, txn, lines);

  audit(req.tenantId!, req.user!.userId, "transaction.create", "Transaction", txn.id, {
    kind: txn.kind,
    grandTotal: txn.grandTotal.toString(),
  });
  res.status(201).json(txn);
});

transactionsRouter.get("/", async (req, res) => {
  const kind = req.query.kind as "SALE" | "PURCHASE" | undefined;
  const txns = await prisma.transaction.findMany({
    where: { tenantId: req.tenantId!, ...(kind ? { kind } : {}) },
    orderBy: { issuedAt: "desc" },
    include: { lines: true, party: true },
  });
  res.json(txns);
});

transactionsRouter.get("/:id", async (req, res) => {
  const txn = await prisma.transaction.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
    include: { lines: true, party: true },
  });
  if (!txn) return res.status(404).json({ error: "Not found" });
  res.json(txn);
});

// Fiscalize a sale via the EFD/SDC adapter (records a fiscal receipt; unconfigured by default).
transactionsRouter.post("/:id/fiscalize", requireWriter, async (req, res) => {
  const txn = await prisma.transaction.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
    include: { party: true },
  });
  if (!txn) return res.status(404).json({ error: "Not found" });
  if (txn.kind !== "SALE") return res.status(400).json({ error: "Only SALES can be fiscalized" });

  const result = await getFiscalAdapter().issue({
    invoiceNo: txn.mushakNo ?? txn.id,
    buyerName: txn.party?.name,
    buyerBin: txn.party?.bin,
    total: txn.grandTotal.toString(),
    vat: txn.vatTotal.toString(),
  });
  const receipt = await prisma.fiscalReceipt.create({
    data: {
      tenantId: req.tenantId!,
      transactionId: txn.id,
      receiptNo: result.receiptNo,
      qrData: result.qrData,
      deviceId: result.deviceId,
      status: result.status,
      message: result.message,
    },
  });
  res.status(201).json({ receipt, result });
});

// Email the Mushak 6.3 invoice to a recipient (logged by the notification adapter).
transactionsRouter.post("/:id/email", requireWriter, async (req, res) => {
  const to = String(req.body?.to ?? "").trim();
  if (!to) return res.status(400).json({ error: "recipient 'to' required" });
  const txn = await prisma.transaction.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
  });
  if (!txn) return res.status(404).json({ error: "Not found" });

  const result = await getNotificationAdapter().send(req.tenantId!, {
    channel: "EMAIL",
    recipient: to,
    subject: `Tax Invoice ${txn.mushakNo ?? txn.id}`,
    body: `Mushak 6.3 tax invoice ${txn.mushakNo ?? txn.id}, total Tk ${txn.grandTotal}.`,
  });
  res.json({ sent: true, status: result.status });
});

// Mushak 6.3 tax invoice as a downloadable PDF (SALES only).
transactionsRouter.get("/:id/mushak-6.3", async (req, res) => {
  const [txn, tenant] = await Promise.all([
    prisma.transaction.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId! },
      include: { lines: true, party: true },
    }),
    prisma.tenant.findUnique({ where: { id: req.tenantId! } }),
  ]);
  if (!txn || !tenant) return res.status(404).json({ error: "Not found" });
  if (txn.kind !== "SALE") {
    return res.status(400).json({ error: "Mushak 6.3 applies to SALES transactions only" });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="mushak-6.3-${txn.mushakNo ?? txn.id}.pdf"`
  );

  renderMushak63(
    {
      invoiceNo: txn.mushakNo ?? txn.id,
      issuedAt: txn.issuedAt,
      seller: { name: tenant.name, bin: tenant.bin, address: tenant.address },
      buyer: { name: txn.party?.name, bin: txn.party?.bin, address: txn.party?.address },
      lines: txn.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity.toString(),
        unitPrice: l.unitPrice.toString(),
        vatRate: l.vatRate.toString(),
        netValue: l.netValue.toString(),
        sdAmount: l.sdAmount.toString(),
        vatAmount: l.vatAmount.toString(),
        lineTotal: l.lineTotal.toString(),
      })),
      netTotal: txn.netTotal.toString(),
      sdTotal: txn.sdTotal.toString(),
      vatTotal: txn.vatTotal.toString(),
      grandTotal: txn.grandTotal.toString(),
    },
    res
  );
});
