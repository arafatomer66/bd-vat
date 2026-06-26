import { Router } from "express";
import { z } from "zod";
import { isValidBin } from "@bd-vat/shared";
import { prisma } from "../prisma.js";
import { requireTenant } from "../middleware/tenant.js";

export const partiesRouter = Router();
partiesRouter.use(requireTenant);

const createPartySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["CUSTOMER", "SUPPLIER", "BOTH"]).optional(),
  bin: z.string().refine(isValidBin, "BIN must be 13 digits").optional(),
  address: z.string().optional(),
});

partiesRouter.post("/", async (req, res) => {
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
