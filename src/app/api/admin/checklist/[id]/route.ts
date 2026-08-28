import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistDefinitions } from "@/db/schema";
import { body, fail, ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;
    const p = await body<{ name?: string; category?: string; isRequired?: boolean; isActive?: boolean; sortOrder?: number }>(req);

    const target = await db.query.checklistDefinitions.findFirst({
      where: eq(checklistDefinitions.id, id),
    });
    if (!target) return fail("ไม่พบรายการ", 404);

    await db
      .update(checklistDefinitions)
      .set({
        name: p.name?.trim() || target.name,
        category: p.category === undefined ? target.category : p.category?.trim() || null,
        isRequired: p.isRequired ?? target.isRequired,
        isActive: p.isActive ?? target.isActive,
        sortOrder: p.sortOrder ?? target.sortOrder,
      })
      .where(eq(checklistDefinitions.id, id));

    await logAuditStandalone({
      actor: admin,
      entityType: "checklist_definition",
      entityId: id,
      action: "UPDATE",
      before: target,
      after: p,
    });
    return ok({ ok: true });
  })(req);
}
