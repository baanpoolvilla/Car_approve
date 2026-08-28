import { body, ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp } from "@/lib/audit";
import { saveInspectionAndAdvance, type InspectionInput } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const payload = await body<InspectionInput>(req);
    const status = await saveInspectionAndAdvance(
      user,
      id,
      {
        phase: payload.phase,
        odometer: Number(payload.odometer),
        fuelLevel: Number(payload.fuelLevel),
        damageNote: payload.damageNote,
        checklist: payload.checklist ?? [],
        photoIds: payload.photoIds ?? [],
      },
      await clientIp()
    );
    return ok({ ok: true, status });
  })(req);
}
