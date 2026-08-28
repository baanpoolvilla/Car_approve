import { body, ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp } from "@/lib/audit";
import { cancelRequest } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const { reason } = await body<{ reason?: string }>(req);
    await cancelRequest(user, id, (reason ?? "").trim(), await clientIp());
    return ok({ ok: true });
  })(req);
}
