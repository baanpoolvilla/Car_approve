import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { fail, ok, route } from "@/lib/api";
import { clearPin, requireRole } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireRole("ADMIN");
    const { id } = await ctx.params;

    const target = await db.query.users.findFirst({ where: eq(users.id, id) });
    if (!target) return fail("ไม่พบผู้ใช้", 404);

    await clearPin(id);
    await logAuditStandalone({
      actor: admin,
      entityType: "user",
      entityId: id,
      action: "PIN_RESET",
      after: { email: target.email },
    });
    return ok({ ok: true });
  })(req);
}
