import "server-only";
import { and, eq, or } from "drizzle-orm";
import { type DbLike } from "@/db";
import { userRoles, users } from "@/db/schema";

/**
 * Who gets told when a car leaves, comes back, or something goes wrong.
 * There is no approval step any more — the APPROVER role now simply means
 * "supervisor who should be kept informed".
 */
export async function supervisorRecipients(tx: DbLike, exclude?: string) {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(
      and(
        or(eq(userRoles.role, "APPROVER"), eq(userRoles.role, "FLEET_MANAGER")),
        eq(users.isActive, true)
      )
    );
  return Array.from(new Set(rows.map((r) => r.id))).filter((id) => id !== exclude);
}
