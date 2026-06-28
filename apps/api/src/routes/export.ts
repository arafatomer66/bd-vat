import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const exportRouter = Router();
exportRouter.use(requireAuth);

// Full tenant data backup as a JSON download (OWNER only).
exportRouter.get("/tenant", requireRole("OWNER"), async (req, res) => {
  const tenantId = req.tenantId!;
  const [tenant, parties, products, transactions, vds, adjustments, returns, payments, documents, coefficients] =
    await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.party.findMany({ where: { tenantId } }),
      prisma.product.findMany({ where: { tenantId } }),
      prisma.transaction.findMany({ where: { tenantId }, include: { lines: true } }),
      prisma.vdsCertificate.findMany({ where: { tenantId } }),
      prisma.adjustment.findMany({ where: { tenantId } }),
      prisma.vatReturn.findMany({ where: { tenantId } }),
      prisma.payment.findMany({ where: { tenantId } }),
      prisma.mushakDocument.findMany({ where: { tenantId } }),
      prisma.coefficient.findMany({ where: { tenantId } }),
    ]);

  const backup = {
    schema: "bd-vat.backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    tenant,
    parties,
    products,
    transactions,
    vds,
    adjustments,
    returns,
    payments,
    documents,
    coefficients,
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="bd-vat-backup-${tenant?.bin ?? tenantId}.json"`);
  res.send(JSON.stringify(backup, null, 2));
});
