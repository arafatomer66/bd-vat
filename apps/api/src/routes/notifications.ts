import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, requireWriter } from "../middleware/auth.js";
import { getNotificationAdapter } from "../integrations/notify.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get("/", async (req, res) => {
  const logs = await prisma.notificationLog.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(logs);
});

// Check the just-closed period and email a reminder if its 9.1 isn't submitted yet.
notificationsRouter.post("/deadline-check", requireWriter, async (req, res) => {
  const tenantId = req.tenantId!;
  const now = new Date();
  const dueMonth = now.getUTCMonth() + 1;
  const closedMonth = dueMonth === 1 ? 12 : dueMonth - 1;
  const closedYear = dueMonth === 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const dueDate = new Date(Date.UTC(now.getUTCFullYear(), dueMonth - 1, 15)).toISOString().slice(0, 10);

  const ret = await prisma.vatReturn.findUnique({
    where: { tenantId_year_month: { tenantId, year: closedYear, month: closedMonth } },
  });
  if (ret?.status === "SUBMITTED") {
    return res.json({ sent: false, reason: `Return for ${closedYear}-${closedMonth} already submitted` });
  }

  const owner = await prisma.user.findFirst({ where: { tenantId, role: "OWNER" } });
  if (!owner) return res.json({ sent: false, reason: "No owner email on file" });

  const result = await getNotificationAdapter().send(tenantId, {
    channel: "EMAIL",
    recipient: owner.email,
    subject: `Mushak 9.1 reminder — ${closedYear}-${String(closedMonth).padStart(2, "0")}`,
    body: `Your VAT return for ${closedYear}-${String(closedMonth).padStart(2, "0")} is due by ${dueDate}. Please file on vat.gov.bd.`,
  });
  res.json({ sent: true, status: result.status, period: `${closedYear}-${closedMonth}`, dueDate });
});
