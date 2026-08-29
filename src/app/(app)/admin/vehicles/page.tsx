import { asc, desc, gte } from "drizzle-orm";
import { db } from "@/db";
import { vehicleUnavailability, vehicles } from "@/db/schema";
import { requireRolePage } from "@/lib/auth";
import { BackLink, PageHeader } from "@/components/ui";
import VehiclesAdmin from "./VehiclesAdmin";

export const dynamic = "force-dynamic";

export default async function AdminVehiclesPage() {
  await requireRolePage("FLEET_MANAGER");

  const [rows, blocks] = await Promise.all([
    db.select().from(vehicles).orderBy(asc(vehicles.brand)),
    db
      .select()
      .from(vehicleUnavailability)
      .where(gte(vehicleUnavailability.endAt, new Date()))
      .orderBy(desc(vehicleUnavailability.startAt)),
  ]);

  return (
    <div>
      <BackLink href="/more" label="เมนู" />
      <PageHeader title="ข้อมูลรถ" subtitle={`${rows.length} คัน`} />
      <VehiclesAdmin
        vehicles={rows.map((v) => ({
          id: v.id,
          plateNumber: v.plateNumber,
          brand: v.brand,
          model: v.model,
          year: v.year,
          color: v.color,
          seats: v.seats,
          currentOdometer: v.currentOdometer,
          powerType: v.powerType,
          status: v.status,
          note: v.note,
          isActive: v.isActive,
        }))}
        blocks={blocks.map((b) => ({
          id: b.id,
          vehicleId: b.vehicleId,
          reason: b.reason,
          startAt: b.startAt.toISOString(),
          endAt: b.endAt.toISOString(),
        }))}
      />
    </div>
  );
}
