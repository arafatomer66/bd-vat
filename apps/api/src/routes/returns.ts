import { Router } from "express";
import { z } from "zod";
import { computeReturn } from "@bd-vat/vat-engine";
import { prisma } from "../prisma.js";
import { requireTenant } from "../middleware/tenant.js";

export const returnsRouter = Router();
returnsRouter.use(requireTenant);

const compileSchema = z.object({
  year: z.number().int().min(2019),
  month: z.number().int().min(1).max(12),
});

/**
 * Compile the Mushak 9.1 monthly return for a tax period by aggregating the
 * tenant's issued transactions, VDS certificates and adjustments, then running
 * the VAT engine. Upserts a DRAFT return the user can review and finalise.
 */
returnsRouter.post("/compile", async (req, res) => {
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

function priorPeriod(tenantId: string, year: number, month: number) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return { tenantId, year: prevYear, month: prevMonth };
}
