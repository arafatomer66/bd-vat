import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireWriter } from "../middleware/auth.js";
import { renderVdsReturnPdf } from "../mushak/forms.js";

export const vdsRouter = Router();
vdsRouter.use(requireAuth);

const createVdsSchema = z.object({
  certificateNo: z.string().min(1),
  // true  => VAT withheld on OUR sales by a withholding entity (reduces our payable)
  // false => VAT WE withheld on a purchase (we deposit to treasury)
  withheldOnOurSales: z.boolean(),
  amount: z.number().nonnegative(),
  issuedAt: z.coerce.date(),
  transactionId: z.string().optional(),
});

// Mushak 6.6 — record a VAT-Deducted-at-Source certificate.
vdsRouter.post("/", requireWriter, async (req, res) => {
  const parsed = createVdsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const cert = await prisma.vdsCertificate.create({
    data: { ...parsed.data, tenantId: req.tenantId! },
  });
  res.status(201).json(cert);
});

vdsRouter.get("/", async (req, res) => {
  const certs = await prisma.vdsCertificate.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { issuedAt: "desc" },
  });
  res.json(certs);
});

// VDS withholding return PDF for a period — certificates where WE withheld on purchases.
vdsRouter.get("/return", async (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!year || !month) return res.status(400).json({ error: "year and month required" });
  const range = { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };

  const [certs, tenant] = await Promise.all([
    prisma.vdsCertificate.findMany({
      where: { tenantId: req.tenantId!, withheldOnOurSales: false, issuedAt: range },
      orderBy: { issuedAt: "asc" },
    }),
    prisma.tenant.findUnique({ where: { id: req.tenantId! } }),
  ]);
  if (!tenant) return res.status(404).json({ error: "Not found" });
  const total = certs.reduce((s, c) => s + Number(c.amount), 0).toFixed(2);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="vds-return-${year}-${month}.pdf"`);
  renderVdsReturnPdf(
    {
      company: { name: tenant.name, bin: tenant.bin },
      year,
      month,
      certificates: certs.map((c) => ({
        certificateNo: c.certificateNo,
        issuedAt: c.issuedAt.toISOString().slice(0, 10),
        amount: c.amount.toString(),
      })),
      total,
    },
    res
  );
});
