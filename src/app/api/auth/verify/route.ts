import { body, ok, route } from "@/lib/api";
import { verifyLoginCode } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { email, code } = await body<{ email?: string; code?: string }>(req);
  if (!email?.trim() || !code?.trim()) return ok({ error: "ข้อมูลไม่ครบ" }, 400);

  const user = await verifyLoginCode(email, code);
  await logAuditStandalone({
    actor: { id: user.id, email: user.email, name: user.name, department: null, roles: [] },
    entityType: "session",
    entityId: user.id,
    action: "LOGIN",
  });
  return ok({ ok: true });
});
