import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const companiesRouter = Router();
companiesRouter.use(requireAuth);

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
