import { eq } from "drizzle-orm";
import { db } from "@/db";
import { roleEnum, userRoles, users } from "@/db/schema";
import { body, fail, ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";
import { notifyNow } from "@/lib/notify";
import type { RoleCode } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  email: string;
  name: string;
  department?: string;
  roles?: RoleCode[];
};

export const POST = route(async (req) => {
  const admin = await requireRole("ADMIN");
  const p = await body<Payload>(req);

  const email = p.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("อีเมลไม่ถูกต้อง");
  if (!p.name?.trim()) return fail("กรุณาระบุชื่อ");

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return fail("มีผู้ใช้อีเมลนี้อยู่แล้ว");

  const roles = Array.from(new Set<RoleCode>(["EMPLOYEE", ...(p.roles ?? [])])).filter((r) =>
    roleEnum.enumValues.includes(r)
  );

  const [created] = await db
    .insert(users)
    .values({ email, name: p.name.trim(), department: p.department?.trim() || null })
    .returning({ id: users.id });

  await db.insert(userRoles).values(roles.map((role) => ({ userId: created.id, role })));

  await logAuditStandalone({
    actor: admin,
    entityType: "user",
    entityId: created.id,
    action: "CREATE",
    after: { email, name: p.name, roles },
  });

  await notifyNow({
    userIds: [created.id],
    type: "USER_INVITED",
    title: "คุณได้รับเชิญให้ใช้ระบบบันทึกการใช้รถบริษัท",
    body: "เข้าสู่ระบบด้วยอีเมลนี้ได้ทันที ระบบจะส่งรหัสยืนยัน 6 หลักให้ทุกครั้งที่ล็อกอิน",
    link: "/",
  });

  return ok({ id: created.id }, 201);
});
