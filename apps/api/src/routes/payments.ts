import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireWriter } from "../middleware/auth.js";
import { postPayment } from "../ledger/accounts.js";

export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

const num = (v: unknown) => Number(v ?? 0);
const r2 = (n: number) => n.toFixed(2);

const createSchema = z.object({
  partyId: z.string().optional(),
  kind: z.enum(["RECEIPT", "PAYMENT"]),
  amount: z.number().positive(),
  method: z.string().optional(),
  memo: z.string().optional(),
  date: z.coerce.date(),
});

paymentsRouter.post("/", requireWriter, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const payment = await prisma.payment.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  await postPayment(req.tenantId!, { id: payment.id, kind: parsed.data.kind, amount: parsed.data.amount, date: parsed.data.date });
  res.status(201).json(payment);
});

paymentsRouter.get("/", async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { date: "desc" },
    include: { party: true },
  });
  res.json(payments);
});

// Per-party ledger: invoices (sales = debit to customer, purchases = credit) and payments,
// with a running balance. Positive balance = receivable; negative = payable.
paymentsRouter.get("/party/:id/ledger", async (req, res) => {
  const tenantId = req.tenantId!;
  const partyId = req.params.id!;
  const [txns, payments, party] = await Promise.all([
    prisma.transaction.findMany({ where: { tenantId, partyId, status: "ISSUED" }, orderBy: { issuedAt: "asc" } }),
    prisma.payment.findMany({ where: { tenantId, partyId }, orderBy: { date: "asc" } }),
    prisma.party.findFirst({ where: { id: partyId, tenantId } }),
  ]);
  if (!party) return res.status(404).json({ error: "Not found" });

  const events = [
    ...txns.map((t) => ({
      date: t.issuedAt,
      ref: t.mushakNo ?? t.id,
      desc: t.kind === "SALE" ? "Sales invoice" : "Purchase bill",
      delta: t.kind === "SALE" ? num(t.grandTotal) : -num(t.grandTotal),
    })),
    ...payments.map((p) => ({
      date: p.date,
      ref: p.id.slice(-6),
      desc: p.kind === "RECEIPT" ? "Receipt" : "Payment",
      delta: p.kind === "RECEIPT" ? -num(p.amount) : num(p.amount),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let running = 0;
  const rows = events.map((e) => {
    running += e.delta;
    return { date: e.date, ref: e.ref, desc: e.desc, amount: r2(e.delta), balance: r2(running) };
  });
  res.json({ party: { id: party.id, name: party.name }, rows, balance: r2(running) });
});

// Aging of outstanding balances by invoice age (0-30 / 31-60 / 61-90 / 90+).
paymentsRouter.get("/aging", async (req, res) => {
  const type = req.query.type === "payable" ? "payable" : "receivable";
  const kind = type === "receivable" ? "SALE" : "PURCHASE";
  const tenantId = req.tenantId!;

  const [txns, payments] = await Promise.all([
    prisma.transaction.findMany({
      where: { tenantId, kind, status: "ISSUED", partyId: { not: null } },
      include: { party: true },
    }),
    prisma.payment.findMany({
      where: { tenantId, kind: type === "receivable" ? "RECEIPT" : "PAYMENT", partyId: { not: null } },
    }),
  ]);

  // Net each party's invoice total against their payments, then bucket by oldest-invoice age.
  const now = Date.now();
  const byParty = new Map<string, { name: string; outstanding: number; oldest: number }>();
  for (const t of txns) {
    const cur = byParty.get(t.partyId!) ?? { name: t.party?.name ?? "—", outstanding: 0, oldest: t.issuedAt.getTime() };
    cur.outstanding += num(t.grandTotal);
    cur.oldest = Math.min(cur.oldest, t.issuedAt.getTime());
    byParty.set(t.partyId!, cur);
  }
  for (const p of payments) {
    const cur = byParty.get(p.partyId!);
    if (cur) cur.outstanding -= num(p.amount);
  }

  const buckets = { current: 0, d30: 0, d60: 0, d90: 0, older: 0 };
  const rows = [...byParty.values()]
    .filter((p) => p.outstanding > 0.01)
    .map((p) => {
      const ageDays = Math.floor((now - p.oldest) / 86_400_000);
      const bucket = ageDays <= 30 ? "current" : ageDays <= 60 ? "d30" : ageDays <= 90 ? "d60" : ageDays <= 120 ? "d90" : "older";
      buckets[bucket] += p.outstanding;
      return { party: p.name, outstanding: r2(p.outstanding), ageDays, bucket };
    });
  const fmt = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, r2(v)]));
  res.json({ type, rows, buckets: fmt });
});
