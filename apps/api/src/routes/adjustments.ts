import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireTenant } from "../middleware/tenant.js";

export const adjustmentsRouter = Router();
adjustmentsRouter.use(requireTenant);

const createAdjustmentSchema = z.object({
  // Credit note (6.7) decreases net payable; debit note (6.8) increases it.
  kind: z.enum(["INCREASING", "DECREASING"]),
  form: z.enum(["6.7", "6.8"]).optional(),
  refNo: z.string().optional(),
  reason: z.string().optional(),
  partyId: z.string().optional(),
  amount: z.number().nonnegative(),
  issuedAt: z.coerce.date(),
});

// Issue a credit/debit note or other increasing/decreasing adjustment.
adjustmentsRouter.post("/", async (req, res) => {
  const parsed = createAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  // Default the Mushak form from the direction if not given.
  const form = parsed.data.form ?? (parsed.data.kind === "DECREASING" ? "6.7" : "6.8");
  const adj = await prisma.adjustment.create({
    data: { ...parsed.data, form, tenantId: req.tenantId! },
  });
  res.status(201).json(adj);
});

adjustmentsRouter.get("/", async (req, res) => {
  const adjustments = await prisma.adjustment.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { issuedAt: "desc" },
    include: { party: true },
  });
  res.json(adjustments);
});
