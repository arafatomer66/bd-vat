import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { renderRegistrationPdf } from "../mushak/forms.js";

export const companiesRouter = Router();
companiesRouter.use(requireAuth);

// Mushak 2.1 — pre-filled VAT registration application PDF from the company profile.
companiesRouter.get("/registration-2.1", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! } });
  if (!tenant) return res.status(404).json({ error: "Not found" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="mushak-2.1-${tenant.bin}.pdf"`);
  renderRegistrationPdf(
    {
      name: tenant.name,
      bin: tenant.bin,
      tin: tenant.tin,
      address: tenant.address,
      commissionerate: tenant.commissionerate,
      division: tenant.division,
      circle: tenant.circle,
      economicActivity: tenant.economicActivity,
    },
    res
  );
});

// The caller's own company (tenant is derived from the JWT). Onboarding new
// companies happens through POST /api/auth/signup.
companiesRouter.get("/", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! } });
  res.json(tenant ? [tenant] : []);
});

companiesRouter.get("/:id", async (req, res) => {
  if (req.params.id !== req.tenantId) return res.status(403).json({ error: "Forbidden" });
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! } });
  if (!tenant) return res.status(404).json({ error: "Not found" });
  res.json(tenant);
});
