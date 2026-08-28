import { body, ok, route } from "@/lib/api";
import { changePin, requireUser } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const user = await requireUser();
  const { currentPin, newPin, confirmPin } = await body<{
    currentPin?: string;
    newPin?: string;
    confirmPin?: string;
  }>(req);
  if (!currentPin || !newPin || !confirmPin) return ok({ error: "ข้อมูลไม่ครบ" }, 400);
  if (newPin !== confirmPin) return ok({ error: "รหัสใหม่ทั้งสองช่องไม่ตรงกัน" }, 400);

  await changePin(user.id, currentPin, newPin);
  await logAuditStandalone({
    actor: user,
    entityType: "user",
    entityId: user.id,
    action: "PIN_CHANGED",
  });
  return ok({ ok: true });
});
