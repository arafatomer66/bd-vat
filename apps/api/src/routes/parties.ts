import { Router } from "express";
import { z } from "zod";
import { isValidBin } from "@bd-vat/shared";
import { prisma } from "../prisma.js";
import { requireAuth, requireWriter } from "../middleware/auth.js";

export const partiesRouter = Router();
partiesRouter.use(requireAuth);

const createPartySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional(),
  bin: z.string().refine(isValidBin, "BIN must be 13 digits").optional(),
  address: z.string().optional(),
});

partiesRouter.post("/", requireWriter, async (req, res) => {
  const parsed = createPartySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const party = await prisma.party.create({
    data: { ...parsed.data, tenantId: req.tenantId! },
  });
  res.status(201).json(party);
});

partiesRouter.get("/", async (req, res) => {
  const parties = await prisma.party.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { name: "asc" },
  });
  res.json(parties);
});

// Bulk import parties from a parsed row array (client parses the CSV file).
const importSchema = z.object({ rows: z.array(createPartySchema).min(1).max(2000) });
partiesRouter.post("/import", requireWriter, async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const result = await prisma.party.createMany({
    data: parsed.data.rows.map((r) => ({ ...r, tenantId: req.tenantId! })),
  });
  res.status(201).json({ imported: result.count });
});
