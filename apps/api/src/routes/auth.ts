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

// --- Multi-company (accounting-firm mode) ------------------------------------

/** All tenants the user can act for: their home tenant plus explicit memberships. */
async function accessibleTenants(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: true, memberships: { include: { tenant: true } } },
  });
  if (!user) return [];
  const map = new Map<string, { id: string; name: string; bin: string; role: string }>();
  map.set(user.tenantId, { id: user.tenant.id, name: user.tenant.name, bin: user.tenant.bin, role: user.role });
  for (const m of user.memberships) {
    if (!map.has(m.tenantId)) {
      map.set(m.tenantId, { id: m.tenant.id, name: m.tenant.name, bin: m.tenant.bin, role: m.role });
    }
  }
  return [...map.values()];
}

authRouter.get("/memberships", requireAuth, async (req, res) => {
  res.json(await accessibleTenants(req.user!.userId));
});

// Switch the active company; issues a fresh token scoped to that tenant + role.
const switchSchema = z.object({ tenantId: z.string().min(1) });
authRouter.post("/switch", requireAuth, async (req, res) => {
  const parsed = switchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const tenants = await accessibleTenants(req.user!.userId);
  const target = tenants.find((t) => t.id === parsed.data.tenantId);
  if (!target) return res.status(403).json({ error: "No access to that company" });

  const token = signToken({
    userId: req.user!.userId,
    tenantId: target.id,
    role: target.role as "OWNER" | "ACCOUNTANT" | "VIEWER",
  });
  res.json({ token, company: { id: target.id, name: target.name, bin: target.bin } });
});

// OWNER attaches an existing user (by email) to this company as staff.
const attachSchema = z.object({
  email: z.string().email(),
  role: z.enum(["OWNER", "ACCOUNTANT", "VIEWER"]).default("ACCOUNTANT"),
});
authRouter.post("/memberships", requireAuth, requireRole("OWNER"), async (req, res) => {
  const parsed = attachSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) return res.status(404).json({ error: "No user with that email" });

  const membership = await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: req.tenantId! } },
    update: { role: parsed.data.role },
    create: { userId: user.id, tenantId: req.tenantId!, role: parsed.data.role },
  });
  audit(req.tenantId!, req.user!.userId, "membership.attach", "User", user.id, { role: membership.role });
  res.status(201).json({ ok: true });
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
