import { body, ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp } from "@/lib/audit";
import { endTrip } from "@/lib/trips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  odometer: number;
  energyLevel: number;
  hasDamage?: boolean;
  damageNote?: string;
  photoIds?: string[];
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const p = await body<Payload>(req);

    const result = await endTrip(
      user,
      id,
      {
        odometer: Number(p.odometer),
        energyLevel: Number(p.energyLevel),
        hasDamage: Boolean(p.hasDamage),
        damageNote: p.damageNote,
        photoIds: p.photoIds ?? [],
      },
      await clientIp()
    );
    return ok({ ok: true, ...result });
  })(req);
}
