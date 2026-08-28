import { ok, route } from "@/lib/api";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async () => {
  const user = await getCurrentUser();
  await destroySession();
  if (user) {
    await logAuditStandalone({
      actor: user,
      entityType: "session",
      entityId: user.id,
      action: "LOGOUT",
    });
  }
  return ok({ ok: true });
});
