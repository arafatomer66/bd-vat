import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { isValidBin, isValidTin } from "@bd-vat/shared";
import { prisma } from "../prisma.js";
import { signToken, requireAuth, requireRole } from "../middleware/auth.js";
import { audit } from "../audit.js";

export const authRouter = Router();

const signupSchema = z.object({
  companyName: z.string().min(1),
  bin: z.string().refine(isValidBin, "BIN must be 13 digits"),
  tin: z.string().refine(isValidTin, "TIN must be 12 digits").optional(),
  name: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8),
});

// Onboard a new company together with its first OWNER user.
authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const [binTaken, emailTaken] = await Promise.all([
    prisma.tenant.findUnique({ where: { bin: d.bin } }),
    prisma.user.findUnique({ where: { email: d.email } }),
  ]);
  if (binTaken) return res.status(409).json({ error: "A company with this BIN already exists" });
  if (emailTaken) return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await bcrypt.hash(d.password, 10);
  const tenant = await prisma.tenant.create({
    data: {
      name: d.companyName,
      bin: d.bin,
      tin: d.tin,
      users: { create: { email: d.email, passwordHash, name: d.name, role: "OWNER" } },
    },
    include: { users: true },
  });
  const user = tenant.users[0]!;
  audit(tenant.id, user.id, "tenant.signup", "Tenant", tenant.id);

  const token = signToken({ userId: user.id, tenantId: tenant.id, role: "OWNER" });
  res.status(201).json({ token, user: publicUser(user), company: publicCompany(tenant) });
});

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    include: { tenant: true },
  });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const token = signToken({ userId: user.id, tenantId: user.tenantId, role: user.role });
  res.json({ token, user: publicUser(user), company: publicCompany(user.tenant) });
});

// Current user + company.
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    include: { tenant: true },
  });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ user: publicUser(user), company: publicCompany(user.tenant) });
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
  role: z.enum(["OWNER", "ACCOUNTANT", "VIEWER"]),
});

// OWNER can add staff users (accountants / viewers) to the company.
authRouter.post("/users", requireAuth, requireRole("OWNER"), async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.user.create({
    data: {
      tenantId: req.tenantId!,
      email: parsed.data.email,
      passwordHash,
      name: parsed.data.name,
      role: parsed.data.role,
    },
  });
  audit(req.tenantId!, req.user!.userId, "user.create", "User", user.id, { role: user.role });
  res.status(201).json(publicUser(user));
});

authRouter.get("/users", requireAuth, async (req, res) => {
  const users = await prisma.user.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { createdAt: "asc" },
  });
  res.json(users.map(publicUser));
});

authRouter.get("/audit", requireAuth, async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    where: { tenantId: req.tenantId! },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(logs);
});

function publicUser(u: { id: string; email: string; name: string | null; role: string }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
function publicCompany(t: { id: string; name: string; bin: string }) {
  return { id: t.id, name: t.name, bin: t.bin };
}
