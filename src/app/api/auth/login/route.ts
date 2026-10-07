import { body, ok, route } from "@/lib/api";
import { loginWithPin } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  // embed = หน้า login ถูกเปิดอยู่ในกรอบ (ข้างใน SmartBoss) — ต้องออก cookie แบบที่ใช้ในกรอบได้
  const { email, pin, embed } = await body<{ email?: string; pin?: string; embed?: boolean }>(req);
  if (!email?.trim() || !pin) return ok({ error: "ข้อมูลไม่ครบ" }, 400);

  const user = await loginWithPin(email, pin, { embed: embed === true });
  await logAuditStandalone({
    actor: { id: user.id, email: user.email, name: user.name, department: null, roles: [] },
    entityType: "session",
    entityId: user.id,
    action: "LOGIN",
  });
  return ok({ ok: true });
});
