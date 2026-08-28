import { body, ok, route } from "@/lib/api";
import { loginWithPin } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { email, pin } = await body<{ email?: string; pin?: string }>(req);
  if (!email?.trim() || !pin) return ok({ error: "ข้อมูลไม่ครบ" }, 400);

  const user = await loginWithPin(email, pin);
  await logAuditStandalone({
    actor: { id: user.id, email: user.email, name: user.name, department: null, roles: [] },
    entityType: "session",
    entityId: user.id,
    action: "LOGIN",
  });
  return ok({ ok: true });
});
