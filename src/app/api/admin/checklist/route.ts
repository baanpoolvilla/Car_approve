import { eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistDefinitions, photoAngleEnum } from "@/db/schema";
import { body, fail, ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";
import { setSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const admin = await requireRole("ADMIN");
  const p = await body<{ code: string; name: string; category?: string; isRequired?: boolean }>(req);

  const code = p.code?.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  if (!code) return fail("กรุณาระบุรหัสรายการ");
  if (!p.name?.trim()) return fail("กรุณาระบุชื่อรายการ");

  const existing = await db.query.checklistDefinitions.findFirst({
    where: eq(checklistDefinitions.code, code),
  });
  if (existing) return fail("มีรายการรหัสนี้อยู่แล้ว");

  const rows = await db.select().from(checklistDefinitions);
  const [created] = await db
    .insert(checklistDefinitions)
    .values({
      code,
      name: p.name.trim(),
      category: p.category?.trim() || null,
      isRequired: p.isRequired ?? true,
      sortOrder: (rows.length + 1) * 10,
    })
    .returning({ id: checklistDefinitions.id });

  await logAuditStandalone({
    actor: admin,
    entityType: "checklist_definition",
    entityId: created.id,
    action: "CREATE",
    after: p,
  });
  return ok({ id: created.id }, 201);
});

export const PUT = route(async (req) => {
  const admin = await requireRole("ADMIN");
  const p = await body<{ angles: string[] }>(req);

  const angles = (p.angles ?? []).filter((a) => photoAngleEnum.enumValues.includes(a as never));
  if (angles.length === 0) return fail("ต้องเลือกมุมรูปบังคับอย่างน้อย 1 มุม");

  await setSetting("required_photo_angles", angles);
  await logAuditStandalone({
    actor: admin,
    entityType: "settings",
    entityId: "required_photo_angles",
    action: "UPDATE",
    after: { angles },
  });
  return ok({ ok: true });
});
