import { ok, route, fail } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listAvailableVehicles } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireUser();
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const exclude = url.searchParams.get("exclude") ?? undefined;
  if (!from || !to) return fail("ต้องระบุช่วงเวลา from และ to");

  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return fail("รูปแบบวันเวลาไม่ถูกต้อง");
  }
  if (end <= start) return fail("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");

  const rows = await listAvailableVehicles(start, end, exclude);
  return ok({
    vehicles: rows.map((r) => ({
      id: r.vehicle.id,
      brand: r.vehicle.brand,
      model: r.vehicle.model,
      plateNumber: r.vehicle.plateNumber,
      seats: r.vehicle.seats,
      status: r.vehicle.status,
      currentOdometer: r.vehicle.currentOdometer,
      available: r.available,
      hardConflicts: r.hardConflicts.map((c) => ({
        requestNo: c.requestNo,
        requester: c.requester,
        start: c.start,
        end: c.end,
      })),
      pendingConflicts: r.pendingConflicts.length,
      blocks: r.blocks.map((b) => ({ reason: b.reason, start: b.startAt, end: b.endAt })),
    })),
  });
});
