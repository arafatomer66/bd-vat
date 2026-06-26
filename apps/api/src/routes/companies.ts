import { Router } from "express";
import { z } from "zod";
import { isValidBin, isValidTin } from "@bd-vat/shared";
import { prisma } from "../prisma.js";

export const companiesRouter = Router();

const createCompanySchema = z.object({
  name: z.string().min(1),
  bin: z.string().refine(isValidBin, "BIN must be 13 digits"),
  tin: z.string().refine(isValidTin, "TIN must be 12 digits").optional(),
  commissionerate: z.string().optional(),
  division: z.string().optional(),
  circle: z.string().optional(),
  economicActivity: z.string().optional(),
  address: z.string().optional(),
});

// Onboard a new VAT-registered company (tenant). This is the only unscoped route.
companiesRouter.post("/", async (req, res) => {
  const parsed = createCompanySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await prisma.tenant.findUnique({ where: { bin: parsed.data.bin } });
  if (existing) {
    return res.status(409).json({ error: "A company with this BIN already exists" });
  }
  const tenant = await prisma.tenant.create({ data: parsed.data });
  res.status(201).json(tenant);
});

// List companies (tenant picker for the workspace; replaced by auth-scoped context later).
companiesRouter.get("/", async (_req, res) => {
  const tenants = await prisma.tenant.findMany({ orderBy: { createdAt: "asc" } });
  res.json(tenants);
});

companiesRouter.get("/:id", async (req, res) => {
  const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
  if (!tenant) return res.status(404).json({ error: "Not found" });
  res.json(tenant);
});
