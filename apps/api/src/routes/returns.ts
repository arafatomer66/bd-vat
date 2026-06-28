import { Router } from "express";
import { z } from "zod";
import { computeReturn } from "@bd-vat/vat-engine";
import { prisma } from "../prisma.js";
import { requireAuth, requireWriter } from "../middleware/auth.js";
import { audit } from "../audit.js";
import { renderMushak91 } from "../mushak/mushak91.js";
import { salesRegisterCsv, purchaseRegisterCsv } from "../mushak/registers.js";
import { getNbrAdapter, type NbrSubmissionPackage, type RegisterRow } from "../nbr/adapter.js";
import { getChallanAdapter } from "../integrations/challan.js";

export const returnsRouter = Router();
returnsRouter.use(requireAuth);

const compileSchema = z.object({
  year: z.number().int().min(2019),
  month: z.number().int().min(1).max(12),
});

/**
 * Compile the Mushak 9.1 monthly return for a tax period by aggregating the
 * tenant's issued transactions, VDS certificates and adjustments, then running
 * the VAT engine. Upserts a DRAFT return the user can review and finalise.
 */
returnsRouter.post("/compile", requireWriter, async (req, res) => {
  const parsed = compileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { year, month } = parsed.data;
  const tenantId = req.tenantId!;

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 1));
  const range = { gte: periodStart, lt: periodEnd };

  const [sales, purchases, vds, adjustments, prior] = await Promise.all([
    prisma.transaction.aggregate({
      where: { tenantId, kind: "SALE", status: "ISSUED", issuedAt: range },
      _sum: { vatTotal: true, sdTotal: true },
    }),
    prisma.transaction.aggregate({
      where: { tenantId, kind: "PURCHASE", status: "ISSUED", rebateEligible: true, issuedAt: range },
      _sum: { vatTotal: true },
    }),
    prisma.vdsCertificate.findMany({
      where: { tenantId, issuedAt: range },
    }),
    prisma.adjustment.findMany({ where: { tenantId, issuedAt: range } }),
    prisma.vatReturn.findUnique({
      where: { tenantId_year_month: priorPeriod(tenantId, year, month) },
    }),
  ]);

  const num = (v: unknown) => Number(v ?? 0);
  const vdsOnSales = vds
    .filter((c) => c.withheldOnOurSales)
    .reduce((s, c) => s + num(c.amount), 0);
  const increasing = adjustments
    .filter((a) => a.kind === "INCREASING")
    .reduce((s, a) => s + num(a.amount), 0);
  const decreasing = adjustments
    .filter((a) => a.kind === "DECREASING")
    .reduce((s, a) => s + num(a.amount), 0);

  const result = computeReturn({
    outputVat: num(sales._sum.vatTotal),
    outputSd: num(sales._sum.sdTotal),
    inputVatRebate: num(purchases._sum.vatTotal),
    vdsWithheldOnSales: vdsOnSales,
    increasingAdjustments: increasing,
    decreasingAdjustments: decreasing,
    openingRebateBalance: num(prior?.carryForward),
  });

  const data = {
    outputVat: num(sales._sum.vatTotal),
    outputSd: num(sales._sum.sdTotal),
    inputVatRebate: num(purchases._sum.vatTotal),
    vdsWithheldOnSales: vdsOnSales,
    increasingAdjustment: increasing,
    decreasingAdjustment: decreasing,
    openingRebateBalance: num(prior?.carryForward),
    netPayable: result.netPayable,
    carryForward: result.carryForward,
  };

  const vatReturn = await prisma.vatReturn.upsert({
    where: { tenantId_year_month: { tenantId, year, month } },
    create: { tenantId, year, month, ...data },
    update: data,
  });

  res.json({ return: vatReturn, computed: result });
});

returnsRouter.get("/", async (req, res) => {
  const returns = await prisma.vatReturn.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  res.json(returns);
});

// Mushak 6.1 / 6.2 register CSV for a period: ?type=6.1|6.2&year=&month=
returnsRouter.get("/registers", async (req, res) => {
  const type = req.query.type === "6.1" ? "6.1" : "6.2";
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!year || !month) return res.status(400).json({ error: "year and month required" });

  const range = {
    gte: new Date(Date.UTC(year, month - 1, 1)),
    lt: new Date(Date.UTC(year, month, 1)),
  };
  const kind = type === "6.2" ? "SALE" : "PURCHASE";
  const txns = await prisma.transaction.findMany({
    where: { tenantId: req.tenantId!, kind, status: "ISSUED", issuedAt: range },
    orderBy: { issuedAt: "asc" },
    include: { party: true },
  });
  const csv = type === "6.2" ? salesRegisterCsv(txns) : purchaseRegisterCsv(txns);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="mushak-${type}-${year}-${month}.csv"`);
  res.send(csv);
});

returnsRouter.get("/:id", async (req, res) => {
  const vatReturn = await prisma.vatReturn.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
  });
  if (!vatReturn) return res.status(404).json({ error: "Not found" });
  res.json(vatReturn);
});

// Move a return through DRAFT -> FINALISED -> SUBMITTED.
const statusSchema = z.object({ status: z.enum(["DRAFT", "FINALISED", "SUBMITTED"]) });
returnsRouter.patch("/:id/status", requireWriter, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.vatReturn.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const updated = await prisma.vatReturn.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.status,
      submittedAt: parsed.data.status === "SUBMITTED" ? new Date() : existing.submittedAt,
    },
  });
  audit(req.tenantId!, req.user!.userId, `return.${parsed.data.status.toLowerCase()}`, "VatReturn", updated.id);
  res.json(updated);
});

// Record a treasury challan and recompute net payable from stored figures.
const challanSchema = z.object({
  challanNo: z.string().min(1),
  challanDate: z.coerce.date().optional(),
  treasuryDeposits: z.number().nonnegative(),
});
returnsRouter.patch("/:id/challan", requireWriter, async (req, res) => {
  const parsed = challanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const r = await prisma.vatReturn.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
  });
  if (!r) return res.status(404).json({ error: "Not found" });

  const num = (v: unknown) => Number(v ?? 0);
  const result = computeReturn({
    outputVat: num(r.outputVat),
    outputSd: num(r.outputSd),
    inputVatRebate: num(r.inputVatRebate),
    vdsWithheldOnSales: num(r.vdsWithheldOnSales),
    increasingAdjustments: num(r.increasingAdjustment),
    decreasingAdjustments: num(r.decreasingAdjustment),
    openingRebateBalance: num(r.openingRebateBalance),
    treasuryDeposits: parsed.data.treasuryDeposits,
  });

  const updated = await prisma.vatReturn.update({
    where: { id: r.id },
    data: {
      challanNo: parsed.data.challanNo,
      challanDate: parsed.data.challanDate,
      treasuryDeposits: parsed.data.treasuryDeposits,
      netPayable: result.netPayable,
      carryForward: result.carryForward,
    },
  });
  res.json({ return: updated, computed: result });
});

// Verify the recorded a-Challan via the challan adapter (manual by default).
returnsRouter.post("/:id/verify-challan", requireWriter, async (req, res) => {
  const r = await prisma.vatReturn.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! } });
  if (!r) return res.status(404).json({ error: "Not found" });
  if (!r.challanNo) return res.status(400).json({ error: "No challan recorded on this return" });

  const result = await getChallanAdapter().verify(r.challanNo, Number(r.netPayable));
  const updated = await prisma.vatReturn.update({
    where: { id: r.id },
    data: { challanVerified: result.verified, challanVerifyNote: result.note },
  });
  audit(req.tenantId!, req.user!.userId, "return.verify-challan", "VatReturn", r.id, { verified: result.verified });
  res.json({ return: updated, result });
});

// Mushak 9.1 return as a PDF.
returnsRouter.get("/:id/mushak-9.1", async (req, res) => {
  const r = await prisma.vatReturn.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
  });
  if (!r) return res.status(404).json({ error: "Not found" });
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! } });
  if (!tenant) return res.status(404).json({ error: "Not found" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="mushak-9.1-${r.year}-${r.month}.pdf"`);
  renderMushak91(
    {
      year: r.year,
      month: r.month,
      status: r.status,
      seller: { name: tenant.name, bin: tenant.bin, address: tenant.address },
      outputVat: r.outputVat.toString(),
      outputSd: r.outputSd.toString(),
      inputVatRebate: r.inputVatRebate.toString(),
      vdsWithheldOnSales: r.vdsWithheldOnSales.toString(),
      increasingAdjustment: r.increasingAdjustment.toString(),
      decreasingAdjustment: r.decreasingAdjustment.toString(),
      openingRebateBalance: r.openingRebateBalance.toString(),
      treasuryDeposits: r.treasuryDeposits.toString(),
      netPayable: r.netPayable.toString(),
      carryForward: r.carryForward.toString(),
      challanNo: r.challanNo,
    },
    res
  );
});

// --- NBR submission boundary -------------------------------------------------

async function buildNbrPackage(
  tenantId: string,
  returnId: string
): Promise<NbrSubmissionPackage | null> {
  const r = await prisma.vatReturn.findFirst({ where: { id: returnId, tenantId } });
  if (!r) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return null;

  const range = {
    gte: new Date(Date.UTC(r.year, r.month - 1, 1)),
    lt: new Date(Date.UTC(r.year, r.month, 1)),
  };
  const [sales, purchases] = await Promise.all([
    prisma.transaction.findMany({
      where: { tenantId, kind: "SALE", status: "ISSUED", issuedAt: range },
      include: { party: true },
      orderBy: { issuedAt: "asc" },
    }),
    prisma.transaction.findMany({
      where: { tenantId, kind: "PURCHASE", status: "ISSUED", issuedAt: range },
      include: { party: true },
      orderBy: { issuedAt: "asc" },
    }),
  ]);

  const toRow = (t: (typeof sales)[number]): RegisterRow => ({
    date: t.issuedAt.toISOString().slice(0, 10),
    invoiceNo: t.mushakNo ?? "",
    party: t.party?.name ?? "",
    partyBin: t.party?.bin ?? "",
    net: t.netTotal.toString(),
    sd: t.sdTotal.toString(),
    vat: t.vatTotal.toString(),
    total: t.grandTotal.toString(),
  });

  return {
    schema: "bd-vat.nbr.mushak-9.1",
    version: 1,
    company: { name: tenant.name, bin: tenant.bin, tin: tenant.tin },
    period: { year: r.year, month: r.month },
    return: {
      outputVat: r.outputVat.toString(),
      outputSd: r.outputSd.toString(),
      inputVatRebate: r.inputVatRebate.toString(),
      vdsWithheldOnSales: r.vdsWithheldOnSales.toString(),
      increasingAdjustment: r.increasingAdjustment.toString(),
      decreasingAdjustment: r.decreasingAdjustment.toString(),
      openingRebateBalance: r.openingRebateBalance.toString(),
      treasuryDeposits: r.treasuryDeposits.toString(),
      netPayable: r.netPayable.toString(),
      carryForward: r.carryForward.toString(),
      challanNo: r.challanNo,
    },
    registers: { sales: sales.map(toRow), purchases: purchases.map(toRow) },
    generatedAt: new Date().toISOString(),
  };
}

// Download the submission-ready NBR package (JSON).
returnsRouter.get("/:id/nbr-package", async (req, res) => {
  const pkg = await buildNbrPackage(req.tenantId!, req.params.id!);
  if (!pkg) return res.status(404).json({ error: "Not found" });
  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="nbr-9.1-${pkg.period.year}-${pkg.period.month}.json"`
  );
  res.send(JSON.stringify(pkg, null, 2));
});

// Hand the package to the configured NBR adapter (manual by default).
returnsRouter.post("/:id/nbr-submit", requireWriter, async (req, res) => {
  const pkg = await buildNbrPackage(req.tenantId!, req.params.id!);
  if (!pkg) return res.status(404).json({ error: "Not found" });
  const result = await getNbrAdapter().submit(pkg);
  audit(req.tenantId!, req.user!.userId, "return.nbr-submit", "VatReturn", req.params.id, {
    mode: result.mode,
    accepted: result.accepted,
  });
  res.json(result);
});

function priorPeriod(tenantId: string, year: number, month: number) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return { tenantId, year: prevYear, month: prevMonth };
}
