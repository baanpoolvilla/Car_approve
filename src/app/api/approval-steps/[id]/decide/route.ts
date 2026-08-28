import { body, ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { clientIp } from "@/lib/audit";
import { decideApproval } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireRole("APPROVER");
    const { id } = await ctx.params;
    const { decision, comment } = await body<{ decision: string; comment?: string }>(req);
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      throw new Error("การตัดสินใจไม่ถูกต้อง");
    }
    const requestId = await decideApproval(user, id, decision, comment ?? "", await clientIp());
    return ok({ ok: true, requestId });
  })(req);
}
