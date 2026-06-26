import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireTenant } from "../middleware/tenant.js";

export const vdsRouter = Router();
vdsRouter.use(requireTenant);

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
vdsRouter.post("/", async (req, res) => {
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
