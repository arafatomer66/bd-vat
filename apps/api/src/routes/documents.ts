import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireWriter } from "../middleware/auth.js";
import { renderDocumentPdf } from "../mushak/forms.js";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.string().optional(),
  unitPrice: z.string().optional(),
  amount: z.string().optional(),
});

const createSchema = z.object({
  form: z.enum(["6.4", "6.5", "6.10"]),
  docNo: z.string().optional(),
  counterparty: z.string().optional(),
  fromLocation: z.string().optional(),
  toLocation: z.string().optional(),
  reason: z.string().optional(),
  issuedAt: z.coerce.date(),
  value: z.number().nonnegative().default(0),
  vat: z.number().nonnegative().default(0),
  lines: z.array(lineSchema).default([]),
});

documentsRouter.post("/", requireWriter, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { lines, ...rest } = parsed.data;
  const doc = await prisma.mushakDocument.create({
    data: { ...rest, tenantId: req.tenantId!, lines: JSON.stringify(lines) },
  });
  res.status(201).json(doc);
});

documentsRouter.get("/", async (req, res) => {
  const form = req.query.form as string | undefined;
  const docs = await prisma.mushakDocument.findMany({
    where: { tenantId: req.tenantId!, ...(form ? { form } : {}) },
    orderBy: { issuedAt: "desc" },
  });
  res.json(docs);
});

documentsRouter.get("/:id/pdf", async (req, res) => {
  const d = await prisma.mushakDocument.findFirst({
    where: { id: req.params.id, tenantId: req.tenantId! },
  });
  if (!d) return res.status(404).json({ error: "Not found" });
  const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! } });
  if (!tenant) return res.status(404).json({ error: "Not found" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="mushak-${d.form}-${d.docNo ?? d.id}.pdf"`);
  renderDocumentPdf(
    {
      form: d.form as "6.4" | "6.5" | "6.10",
      company: { name: tenant.name, bin: tenant.bin },
      docNo: d.docNo,
      counterparty: d.counterparty,
      fromLocation: d.fromLocation,
      toLocation: d.toLocation,
      reason: d.reason,
      issuedAt: d.issuedAt,
      value: d.value.toString(),
      vat: d.vat.toString(),
      lines: d.lines ? JSON.parse(d.lines) : [],
    },
    res
  );
});
