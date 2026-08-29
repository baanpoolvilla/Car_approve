import { ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listVehicleStatus } from "@/lib/trips";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireUser();
  const rows = await listVehicleStatus();
  return ok({
    vehicles: rows.map((r) => ({
      id: r.vehicle.id,
      brand: r.vehicle.brand,
      model: r.vehicle.model,
      plateNumber: r.vehicle.plateNumber,
      seats: r.vehicle.seats,
      currentOdometer: r.vehicle.currentOdometer,
      powerType: r.vehicle.powerType,
      status: r.vehicle.status,
      available: r.available,
      usedBy: r.openTrip ? r.openTrip.driverName : null,
      usedSince: r.openTrip ? r.openTrip.checkedOutAt : null,
      blockReason: r.block ? r.block.reason : null,
    })),
  });
});
