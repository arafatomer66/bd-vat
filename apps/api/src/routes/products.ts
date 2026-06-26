import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireWriter } from "../middleware/auth.js";
import { audit } from "../audit.js";

export const productsRouter = Router();
productsRouter.use(requireAuth);

const productSchema = z.object({
  name: z.string().min(1),
  unit: z.string().optional(),
  hsCode: z.string().optional(),
  vatRate: z.number().min(0).max(1).default(0.15),
  sdRate: z.number().min(0).max(1).default(0),
});

productsRouter.get("/", async (req, res) => {
  const products = await prisma.product.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { name: "asc" },
  });
  res.json(products);
});

productsRouter.post("/", requireWriter, async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const product = await prisma.product.create({ data: { ...parsed.data, tenantId: req.tenantId! } });
  res.status(201).json(product);
});

// Bulk import products from a parsed row array (client parses the CSV file).
const importSchema = z.object({ rows: z.array(productSchema).min(1).max(2000) });
productsRouter.post("/import", requireWriter, async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const result = await prisma.product.createMany({
    data: parsed.data.rows.map((r) => ({ ...r, tenantId: req.tenantId! })),
  });
  audit(req.tenantId!, req.user!.userId, "product.import", "Product", undefined, { count: result.count });
  res.status(201).json({ imported: result.count });
});
