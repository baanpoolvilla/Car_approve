import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { roleEnum, userRoles, users } from "@/db/schema";
import { body, fail, ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { logAudit, clientIp } from "@/lib/audit";
import type { RoleCode } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  name?: string;
  department?: string | null;
  isActive?: boolean;
  roles?: RoleCode[];
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const p = await body<Payload>(req);

    const target = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!target) return fail("ไม่พบผู้ใช้", 404);

    const currentRoles = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, id));

    const nextRoles = p.roles
      ? Array.from(new Set<RoleCode>(["EMPLOYEE", ...p.roles])).filter((r) =>
          roleEnum.enumValues.includes(r)
        )
      : null;

    // Never let the last admin lock themselves — and everyone else — out.
    if (
      nextRoles &&
      currentRoles.some((r) => r.role === "ADMIN") &&
      !nextRoles.includes("ADMIN")
    ) {
      const admins = await db
        .select({ userId: userRoles.userId })
        .from(userRoles)
        .where(eq(userRoles.role, "ADMIN"));
      if (admins.length <= 1) return fail("ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน");
    }
    if (p.isActive === false && target.id === admin.id) {
      return fail("ปิดใช้งานบัญชีของตนเองไม่ได้");
    }

    await db.transaction(async (tx: Tx) => {
      await tx
        .update(users)
        .set({
          name: p.name?.trim() || target.name,
          department: p.department === undefined ? target.department : p.department?.trim() || null,
          isActive: p.isActive ?? target.isActive,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));

      if (nextRoles) {
        const removing = currentRoles
          .map((r) => r.role)
          .filter((r) => !nextRoles.includes(r));
        if (removing.length > 0) {
          await tx
            .delete(userRoles)
            .where(and(eq(userRoles.userId, id), inArray(userRoles.role, removing)));
        }
        const adding = nextRoles.filter((r) => !currentRoles.some((c) => c.role === r));
        if (adding.length > 0) {
          await tx.insert(userRoles).values(adding.map((role) => ({ userId: id, role })));
        }
      }

      await logAudit(tx, {
        actor: admin,
        entityType: "user",
        entityId: id,
        action: "UPDATE",
        before: { ...target, roles: currentRoles.map((r) => r.role) },
        after: { ...p, roles: nextRoles ?? currentRoles.map((r) => r.role) },
        ip: await clientIp(),
      });
    });

    return ok({ ok: true });
  })(req);
}
