import type { Request, Response, NextFunction } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

/**
 * Phase 1 tenant resolution: trust an `x-tenant-id` header. This is replaced by
 * JWT-derived tenant context once auth lands (Phase 1.5) — every query is already
 * scoped by req.tenantId, so the swap is isolated to this middleware.
 */
export function requireTenant(req: Request, res: Response, next: NextFunction) {
  const tenantId = req.header("x-tenant-id");
  if (!tenantId) {
    return res.status(401).json({ error: "Missing x-tenant-id header" });
  }
  req.tenantId = tenantId;
  next();
}
