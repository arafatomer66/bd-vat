import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireWriter } from "../middleware/auth.js";
import { renderCoefficientPdf } from "../mushak/forms.js";

export const coefficientsRouter = Router();
coefficientsRouter.use(requireAuth);

const inputSchema = z.object({
  name: z.string().min(1),
  quantity: z.string(),
  unit: z.string().optional(),
  unitPrice: z.string().optional(),
});

const createSchema = z.object({
  productName: z.string().min(1),
  outputUnit: z.string().optional(),
  inputs: z.array(inputSchema).min(1),
});

// Mushak 4.3 — declare the input-output coefficient for a manufactured product.
coefficientsRouter.post("/", requireWriter, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const c = await prisma.coefficient.create({
    data: {
      tenantId: req.tenantId!,
      productName: parsed.data.productName,
      outputUnit: parsed.data.outputUnit,
      inputs: JSON.stringify(parsed.data.inputs),
    },
  });
  res.status(201).json(c);
});

coefficientsRouter.get("/", async (req, res) => {
  const list = await prisma.coefficient.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { declaredAt: "desc" },
  });
  res.json(list);
});

coefficientsRouter.get("/:id/pdf", async (req, res) => {
  const c = await prisma.coefficient.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
  });
  if (!c) return res.status(404).json({ error: "Not found" });
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! } });
  if (!tenant) return res.status(404).json({ error: "Not found" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="mushak-4.3-${c.id}.pdf"`);
  renderCoefficientPdf(
    {
      company: { name: tenant.name, bin: tenant.bin },
      productName: c.productName,
      outputUnit: c.outputUnit,
      declaredAt: c.declaredAt,
      inputs: c.inputs ? JSON.parse(c.inputs) : [],
    },
    res
  );
});
