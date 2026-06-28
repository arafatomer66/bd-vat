import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

const num = (v: unknown) => Number(v ?? 0);

// Stock ledger summary — per item: total in, total out, balance on hand.
inventoryRouter.get("/stock", async (req, res) => {
  const moves = await prisma.stockMovement.findMany({ where: { tenantId: req.tenantId! } });
  const map = new Map<string, { in: number; out: number }>();
  for (const m of moves) {
    const cur = map.get(m.item) ?? { in: 0, out: 0 };
    if (m.direction === "IN") cur.in += num(m.quantity);
    else cur.out += num(m.quantity);
    map.set(m.item, cur);
  }
  const rows = [...map.entries()]
    .map(([item, v]) => ({ item, in: v.in, out: v.out, balance: v.in - v.out }))
    .sort((a, b) => a.item.localeCompare(b.item));
  res.json(rows);
});

inventoryRouter.get("/movements", async (req, res) => {
  const moves = await prisma.stockMovement.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { date: "desc" },
    take: 200,
  });
  res.json(moves);
});
