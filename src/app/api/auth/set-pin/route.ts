import { body, ok, route } from "@/lib/api";
import { setPin } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { email, pin, confirmPin, embed } = await body<{
    email?: string;
    pin?: string;
    confirmPin?: string;
    /** หน้า login ถูกเปิดอยู่ในกรอบ (ข้างใน SmartBoss) — ออก cookie แบบที่ใช้ในกรอบได้ */
    embed?: boolean;
  }>(req);
  if (!email?.trim() || !pin || !confirmPin) return ok({ error: "ข้อมูลไม่ครบ" }, 400);

  const user = await setPin(email, pin, confirmPin, { embed: embed === true });
  await logAuditStandalone({
    actor: { id: user.id, email: user.email, name: user.name, department: null, roles: [] },
    entityType: "user",
    entityId: user.id,
    action: "PIN_SET",
  });
  return ok({ ok: true });
});
