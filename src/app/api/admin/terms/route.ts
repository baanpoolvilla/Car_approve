import { eq } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { termsVersions } from "@/db/schema";
import { body, fail, ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { logAudit, clientIp } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const admin = await requireRole("ADMIN");
  const p = await body<{ version: string; content: string }>(req);

  const version = p.version?.trim();
  if (!version) return fail("กรุณาระบุเลขเวอร์ชัน");
  if (!p.content?.trim()) return fail("กรุณาระบุเนื้อหาเงื่อนไข");

  const existing = await db.query.termsVersions.findFirst({
    where: eq(termsVersions.version, version),
  });
  if (existing) return fail("มีเวอร์ชันนี้อยู่แล้ว");

  const id = await db.transaction(async (tx: Tx) => {
    await tx.update(termsVersions).set({ isActive: false }).where(eq(termsVersions.isActive, true));
    const [row] = await tx
      .insert(termsVersions)
      .values({ version, content: p.content.trim(), isActive: true })
      .returning({ id: termsVersions.id });
    await logAudit(tx, {
      actor: admin,
      entityType: "terms_version",
      entityId: row.id,
      action: "CREATE",
      after: { version },
      ip: await clientIp(),
    });
    return row.id;
  });

  return ok({ id }, 201);
});
