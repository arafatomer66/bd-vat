import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export type Role = "OWNER" | "ACCOUNTANT" | "VIEWER";

export interface AuthClaims {
  userId: string;
  tenantId: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
      user?: AuthClaims;
    }
  }
}

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, env.jwtSecret, { expiresIn: "7d" });
}

/** Verify the Bearer JWT and populate req.user + req.tenantId (tenant scope is token-derived). */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  try {
    const claims = jwt.verify(token, env.jwtSecret) as AuthClaims;
    req.user = claims;
    req.tenantId = claims.tenantId;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Gate a route to specific roles (OWNER implicitly outranks others where listed). */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient role" });
    }
    next();
  };
}

/** Writers = OWNER or ACCOUNTANT; VIEWER is read-only. */
export const requireWriter = requireRole("OWNER", "ACCOUNTANT");
