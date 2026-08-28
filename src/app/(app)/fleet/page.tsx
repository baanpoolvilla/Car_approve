import Link from "next/link";
import { eq, sql, and } from "drizzle-orm";
import { db } from "@/db";
import { incidents, vehicleRequests, vehicles } from "@/db/schema";
import { requireRolePage } from "@/lib/auth";
import { listRequests } from "@/lib/queries";
import { PageHeader, VehicleBadge } from "@/components/ui";
import RequestCard from "@/components/RequestCard";

export const dynamic = "force-dynamic";

export default async function FleetPage() {
  await requireRolePage("FLEET_MANAGER");

  const [fleet, returned, active, openIncidents] = await Promise.all([
    db.select().from(vehicles).orderBy(vehicles.brand),
    listRequests({ statuses: ["RETURNED"], order: "asc", limit: 20 }),
    listRequests({ statuses: ["CHECKED_OUT"], order: "asc", limit: 20 }),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(incidents)
      .where(sql`${incidents.status} <> 'CLOSED'`),
  ]);

  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(vehicleRequests)
    .where(eq(vehicleRequests.status, "PENDING_APPROVAL"));

  return (
    <div className="space-y-5">
      <PageHeader title="Fleet Dashboard" subtitle="ภาพรวมการใช้รถทั้งหมด" />

      <div className="grid grid-cols-3 gap-2">
        <div className="card text-center">
          <p className="text-2xl font-bold text-amber-600">{pending.n}</p>
          <p className="text-[11px] text-slate-500">รออนุมัติ</p>
        </div>
        <Link href="/fleet/returns" className="card text-center">
          <p className="text-2xl font-bold text-orange-600">{returned.length}</p>
          <p className="text-[11px] text-slate-500">คืนรถรอตรวจ</p>
        </Link>
        <div className="card text-center">
          <p className="text-2xl font-bold text-red-600">{openIncidents[0]?.n ?? 0}</p>
          <p className="text-[11px] text-slate-500">เหตุค้างอยู่</p>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">รถในระบบ</h2>
          <Link href="/admin/vehicles" className="text-xs text-blue-700">จัดการรถ →</Link>
        </div>
        <div className="space-y-2">
          {fleet.map((v) => (
            <Link key={v.id} href={`/calendar?v=${v.id}`} className="card flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{v.brand} {v.model ?? ""}</p>
                <p className="text-xs text-slate-500">
                  {v.plateNumber} · {v.currentOdometer.toLocaleString("th-TH")} กม.
                </p>
              </div>
              <VehicleBadge status={v.status} />
            </Link>
          ))}
        </div>
      </section>

      {active.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">กำลังใช้งาน</h2>
          <div className="space-y-2">
            {active.map((r) => <RequestCard key={r.id} r={r} showRequester />)}
          </div>
        </section>
      )}

      <Link href="/reports" className="btn-secondary w-full">📊 รายงานและ Export</Link>
    </div>
  );
}
