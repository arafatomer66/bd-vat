import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const ratesRouter = Router();
ratesRouter.use(requireAuth);

// Standard NBR VAT rate schedule (effective 1 July 2019 under the SD&VAT Act 2012).
const NBR_RATES = [
  { code: "VAT15", description: "Standard VAT", rate: 0.15, category: "STANDARD" },
  { code: "VAT10", description: "Truncated 10%", rate: 0.1, category: "TRUNCATED" },
  { code: "VAT7.5", description: "Truncated 7.5%", rate: 0.075, category: "TRUNCATED" },
  { code: "VAT5", description: "Truncated 5%", rate: 0.05, category: "TRUNCATED" },
  { code: "VAT2.5", description: "Truncated 2.5%", rate: 0.025, category: "TRUNCATED" },
  { code: "VAT1.5", description: "Truncated 1.5%", rate: 0.015, category: "TRUNCATED" },
  { code: "VAT0", description: "Exempt / zero-rated", rate: 0, category: "EXEMPT" },
];

async function ensureRateSchedule() {
  const count = await prisma.vatRateSchedule.count({ where: { tenantId: null } });
  if (count > 0) return;
  const from = new Date(Date.UTC(2019, 6, 1));
  await prisma.vatRateSchedule.createMany({
    data: NBR_RATES.map((r) => ({
      tenantId: null,
      code: r.code,
      description: r.description,
      rate: r.rate,
      category: r.category,
      effectiveFrom: from,
    })),
  });
}

// Rates in effect on a given date (defaults to today). Global NBR rows + tenant rows.
ratesRouter.get("/", async (req, res) => {
  await ensureRateSchedule();
  const on = req.query.on ? new Date(String(req.query.on)) : new Date();
  const rows = await prisma.vatRateSchedule.findMany({
    where: {
      AND: [
        { OR: [{ tenantId: null }, { tenantId: req.tenantId! }] },
        { effectiveFrom: { lte: on } },
      ],
    },
    orderBy: { rate: "desc" },
  });
  // effectiveTo filter in JS (null = still effective)
  const active = rows.filter((r) => !r.effectiveTo || r.effectiveTo >= on);
  res.json(
    active.map((r) => ({
      code: r.code,
      description: r.description,
      rate: r.rate.toString(),
      category: r.category,
      effectiveFrom: r.effectiveFrom,
    }))
  );
});
