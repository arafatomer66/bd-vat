import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

/**
 * Aggregated figures for the dashboard:
 *  - VDS receivable (withheld on our sales) vs payable (we withheld on purchases)
 *  - monthly output vs input VAT trend (last 6 active months)
 *  - filing deadline for the most recent closed period (due 15th of following month)
 */
dashboardRouter.get("/summary", async (req, res) => {
  const tenantId = req.tenantId!;
  const num = (v: unknown) => Number(v ?? 0);

  const [txns, vds, returns] = await Promise.all([
    prisma.transaction.findMany({
      where: { tenantId, status: "ISSUED" },
      select: { kind: true, issuedAt: true, vatTotal: true },
    }),
    prisma.vdsCertificate.findMany({ where: { tenantId }, select: { withheldOnOurSales: true, amount: true } }),
    prisma.vatReturn.findMany({
      where: { tenantId },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 6,
    }),
  ]);

  // Monthly output vs input
  const byMonth = new Map<string, { output: number; input: number }>();
  for (const t of txns) {
    const key = `${t.issuedAt.getUTCFullYear()}-${String(t.issuedAt.getUTCMonth() + 1).padStart(2, "0")}`;
    const m = byMonth.get(key) ?? { output: 0, input: 0 };
    if (t.kind === "SALE") m.output += num(t.vatTotal);
    else m.input += num(t.vatTotal);
    byMonth.set(key, m);
  }
  const months = [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 6)
    .map(([key, v]) => ({ period: key, output: v.output, input: v.input, net: v.output - v.input }))
    .reverse();

  // VDS receivable vs payable
  const vdsReceivable = vds.filter((c) => c.withheldOnOurSales).reduce((s, c) => s + num(c.amount), 0);
  const vdsPayable = vds.filter((c) => !c.withheldOnOurSales).reduce((s, c) => s + num(c.amount), 0);

  // Deadline: the period that just closed (previous month) is due by the 15th of this month.
  const now = new Date();
  const dueYear = now.getUTCFullYear();
  const dueMonth = now.getUTCMonth() + 1; // 1-based current month
  const closedMonth = dueMonth === 1 ? 12 : dueMonth - 1;
  const closedYear = dueMonth === 1 ? dueYear - 1 : dueYear;
  const dueDate = new Date(Date.UTC(dueYear, dueMonth - 1, 15));
  const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / 86_400_000);
  const filed = returns.find(
    (r) => r.year === closedYear && r.month === closedMonth && r.status === "SUBMITTED"
  );

  res.json({
    months,
    vds: { receivable: vdsReceivable.toFixed(2), payable: vdsPayable.toFixed(2) },
    deadline: {
      period: `${closedYear}-${String(closedMonth).padStart(2, "0")}`,
      dueDate: dueDate.toISOString().slice(0, 10),
      daysRemaining,
      filed: Boolean(filed),
    },
  });
});
