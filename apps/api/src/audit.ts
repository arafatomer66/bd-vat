import { prisma } from "./prisma.js";

/** Fire-and-forget audit entry; never blocks or fails the originating request. */
export function audit(
  tenantId: string,
  userId: string | undefined,
  action: string,
  entity?: string,
  entityId?: string,
  meta?: unknown
): void {
  prisma.auditLog
    .create({
      data: {
        tenantId,
        userId,
        action,
        entity,
        entityId,
        meta: meta === undefined ? undefined : JSON.stringify(meta).slice(0, 2000),
      },
    })
    .catch(() => {
      /* audit must never break the request */
    });
}
