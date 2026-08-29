import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { trips, vehicles } from "@/db/schema";
import { body, fail, ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  plateNumber?: string;
  brand?: string;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  seats?: number | null;
  currentOdometer?: number;
  powerType?: "EV" | "FUEL";
  status?: "AVAILABLE" | "IN_USE" | "MAINTENANCE" | "INACTIVE";
  note?: string | null;
  isActive?: boolean;
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireRole("FLEET_MANAGER");
    const { id } = await ctx.params;
    const p = await body<Payload>(req);

    const target = await db.query.vehicles.findFirst({ where: eq(vehicles.id, id) });
    if (!target) return fail("ไม่พบรถ", 404);

    // Vehicles with history are retired, never deleted.
    if (p.isActive === false || p.status === "INACTIVE" || p.status === "MAINTENANCE") {
      const active = await db
        .select({ id: trips.id })
        .from(trips)
        .where(and(eq(trips.vehicleId, id), eq(trips.status, "IN_USE")));
      if (active.length > 0) {
        return fail("รถคันนี้กำลังถูกใช้งานอยู่ กรุณารอให้คืนรถก่อน");
      }
    }

    await db
      .update(vehicles)
      .set({
        plateNumber: p.plateNumber?.trim() || target.plateNumber,
        brand: p.brand?.trim() || target.brand,
        model: p.model === undefined ? target.model : p.model?.trim() || null,
        year: p.year === undefined ? target.year : p.year,
        color: p.color === undefined ? target.color : p.color?.trim() || null,
        seats: p.seats === undefined ? target.seats : p.seats,
        currentOdometer: p.currentOdometer ?? target.currentOdometer,
        powerType: p.powerType ?? target.powerType,
        status: p.status ?? target.status,
        note: p.note === undefined ? target.note : p.note?.trim() || null,
        isActive: p.isActive ?? target.isActive,
        updatedAt: new Date(),
      })
      .where(eq(vehicles.id, id));

    await logAuditStandalone({
      actor: admin,
      entityType: "vehicle",
      entityId: id,
      action: "UPDATE",
      before: target,
      after: p,
    });

    return ok({ ok: true });
  })(req);
}
