import Link from "next/link";
import { desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { incidents, trips, users } from "@/db/schema";
import { requireRolePage } from "@/lib/auth";
import { listVehicleStatus } from "@/lib/trips";
import { listTrips } from "@/lib/queries";
import { fmtDateTime } from "@/lib/datetime";
import TripCard from "@/components/TripCard";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FleetPage() {
  await requireRolePage("FLEET_MANAGER");

  const [fleet, active, recent, openIncidents] = await Promise.all([
    listVehicleStatus(),
    listTrips({ statuses: ["IN_USE"], limit: 20 }),
    listTrips({ statuses: ["COMPLETED"], limit: 10 }),
    db
      .select({ inc: incidents, name: users.name, tripNo: trips.tripNo })
      .from(incidents)
      .innerJoin(users, eq(users.id, incidents.reportedBy))
      .innerJoin(trips, eq(trips.id, incidents.tripId))
      .where(ne(incidents.status, "CLOSED"))
      .orderBy(desc(incidents.occurredAt)),
  ]);

  const [thisMonth] = await db
    .select({
      count: sql<number>`count(*)::int`,
      km: sql<number>`coalesce(sum(${trips.odometerIn} - ${trips.odometerOut}), 0)::int`,
    })
    .from(trips)
    .where(
      sql`${trips.status} = 'COMPLETED' AND ${trips.checkedOutAt} >= date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok')`
    );

  return (
    <div className="space-y-5">
      <PageHeader title="Fleet Dashboard" subtitle="ภาพรวมการใช้รถ" />

      <div className="grid grid-cols-3 gap-2">
        <div className="card text-center">
          <p className="text-2xl font-bold text-indigo-600">{active.length}</p>
          <p className="text-[11px] text-slate-500">รถออกอยู่ตอนนี้</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-blue-700">{thisMonth.km.toLocaleString("th-TH")}</p>
          <p className="text-[11px] text-slate-500">กม. เดือนนี้</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-bold text-red-600">{openIncidents.length}</p>
          <p className="text-[11px] text-slate-500">เหตุค้างอยู่</p>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">สถานะรถ</h2>
          <Link href="/admin/vehicles" className="text-xs text-blue-700">
            จัดการรถ →
          </Link>
        </div>
        <div className="space-y-2">
          {fleet.map((f) => (
            <div key={f.vehicle.id} className="card py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {f.vehicle.brand} {f.vehicle.model ?? ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {f.vehicle.plateNumber} · {f.vehicle.currentOdometer.toLocaleString("th-TH")} กม.
                  </p>
                </div>
                <span
                  className={`chip ${
                    f.available
                      ? "bg-emerald-100 text-emerald-800"
                      : f.openTrip
                        ? "bg-indigo-100 text-indigo-800"
                        : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {f.available ? "ว่าง" : f.openTrip ? "ถูกใช้อยู่" : "ไม่พร้อมใช้"}
                </span>
              </div>
              {f.openTrip && (
                <p className="mt-1.5 text-xs text-slate-600">
                  👤 {f.openTrip.driverName} · 📍 {f.openTrip.destination} · ตั้งแต่{" "}
                  {fmtDateTime(f.openTrip.checkedOutAt)}
                </p>
              )}
              {f.block && <p className="mt-1.5 text-xs text-slate-500">🔒 {f.block.reason}</p>}
            </div>
          ))}
        </div>
      </section>

      {openIncidents.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-red-700">⚠️ เหตุที่ยังไม่ปิด</h2>
          <div className="space-y-2">
            {openIncidents.map(({ inc, name, tripNo }) => (
              <Link
                key={inc.id}
                href={`/trips/${inc.tripId}`}
                className="card block hover:border-red-300"
              >
                <p className="text-sm font-medium text-slate-900">{inc.description}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {tripNo} · {name} · {fmtDateTime(inc.occurredAt)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">รถที่ออกอยู่</h2>
          <div className="space-y-2">
            {active.map((t) => (
              <TripCard key={t.id} t={t} showDriver />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">คืนรถล่าสุด</h2>
        <div className="space-y-2">
          {recent.map((t) => (
            <TripCard key={t.id} t={t} showDriver />
          ))}
        </div>
      </section>

      <Link href="/reports" className="btn-secondary w-full">
        📊 รายงานและ Export
      </Link>
    </div>
  );
}
