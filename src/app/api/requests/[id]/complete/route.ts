import { body, ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { clientIp } from "@/lib/audit";
import { completeRequest } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireRole("FLEET_MANAGER");
    const { id } = await ctx.params;
    const { note } = await body<{ note?: string }>(req);
    await completeRequest(user, id, (note ?? "").trim(), await clientIp());
    return ok({ ok: true });
  })(req);
}
