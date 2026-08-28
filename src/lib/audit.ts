import "server-only";
import { headers } from "next/headers";
import { db, type DbLike } from "@/db";
import { auditEvents } from "@/db/schema";
import type { SessionUser } from "./auth";

export type AuditInput = {
  actor?: SessionUser | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

export async function clientIp() {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  } catch {
    return null;
  }
}

/** Write an audit row. Pass the transaction handle so it commits atomically. */
export async function logAudit(tx: DbLike, input: AuditInput) {
  await tx.insert(auditEvents).values({
    actorId: input.actor?.id ?? null,
    actorEmail: input.actor?.email ?? null,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    action: input.action,
    beforeData: (input.before ?? null) as never,
    afterData: (input.after ?? null) as never,
    ipAddress: input.ip ?? null,
  });
}

export async function logAuditStandalone(input: AuditInput) {
  await logAudit(db, { ...input, ip: input.ip ?? (await clientIp()) });
}
