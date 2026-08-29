import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { trips, vehicleUnavailability, vehicles } from "@/db/schema";
import { body, fail, ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const admin = await requireRole("FLEET_MANAGER");
    const { id } = await ctx.params;
    const p = await body<{ start: string; end: string; reason: string }>(req);

    const vehicle = await db.query.vehicles.findFirst({ where: eq(vehicles.id, id) });
    if (!vehicle) return fail("ไม่พบรถ", 404);
    if (!p.reason?.trim()) return fail("กรุณาระบุเหตุผล");

    const start = new Date(`${p.start}:00+07:00`);
    const end = new Date(`${p.end}:00+07:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return fail("วันเวลาไม่ถูกต้อง");
    if (end <= start) return fail("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");

    // Without advance booking the only clash is a car that is out right now.
    const open = await db
      .select({ tripNo: trips.tripNo })
      .from(trips)
      .where(and(eq(trips.vehicleId, id), eq(trips.status, "IN_USE")));
    if (open.length > 0 && start <= new Date()) {
      return fail(`รถคันนี้กำลังถูกใช้งานอยู่ (${open[0].tripNo}) กรุณารอให้คืนรถก่อน`);
    }

    const [row] = await db
      .insert(vehicleUnavailability)
      .values({ vehicleId: id, startAt: start, endAt: end, reason: p.reason.trim(), createdBy: admin.id })
      .returning({ id: vehicleUnavailability.id });

    await logAuditStandalone({
      actor: admin,
      entityType: "vehicle_unavailability",
      entityId: row.id,
      action: "CREATE",
      after: { vehicleId: id, start, end, reason: p.reason },
    });

    return ok({ id: row.id }, 201);
  })(req);
}
