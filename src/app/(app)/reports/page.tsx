import Link from "next/link";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { trips, users, vehicles } from "@/db/schema";
import { requireRolePage } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/datetime";
import { BackLink, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

function defaultRange() {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    from: first.toISOString().slice(0, 10),
    to: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; v?: string }>;
}) {
  await requireRolePage("FLEET_MANAGER", "AUDITOR");
  const sp = await searchParams;
  const def = defaultRange();
  const from = sp.from ?? def.from;
  const to = sp.to ?? def.to;
  const vehicleId = sp.v ?? "";

  const conditions: (SQL | undefined)[] = [
    gte(trips.checkedOutAt, new Date(`${from}T00:00:00+07:00`)),
    lte(trips.checkedOutAt, new Date(`${to}T23:59:59+07:00`)),
  ];
  if (vehicleId) conditions.push(eq(trips.vehicleId, vehicleId));

  const [rows, fleet] = await Promise.all([
    db
      .select({ t: trips, v: vehicles, u: users })
      .from(trips)
      .innerJoin(users, eq(users.id, trips.driverId))
      .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .where(and(...conditions))
      .orderBy(asc(trips.checkedOutAt))
      .limit(500),
    db.select().from(vehicles).orderBy(asc(vehicles.brand)),
  ]);

  let totalKm = 0;
  const kmByVehicle = new Map<string, number>();
  const tripsByDriver = new Map<string, { name: string; trips: number; km: number }>();

  for (const { t, u } of rows) {
    if (t.status !== "COMPLETED" || t.odometerIn === null) continue;
    const d = Math.max(0, t.odometerIn - t.odometerOut);
    totalKm += d;
    kmByVehicle.set(t.vehicleId, (kmByVehicle.get(t.vehicleId) ?? 0) + d);
    const entry = tripsByDriver.get(t.driverId) ?? { name: u.name, trips: 0, km: 0 };
    entry.trips += 1;
    entry.km += d;
    tripsByDriver.set(t.driverId, entry);
  }

  const damaged = rows.filter((x) => x.t.hasDamage).length;
  const exportQs = new URLSearchParams({ from, to, ...(vehicleId ? { vehicleId } : {}) });

  return (
    <div>
      <BackLink href="/more" label="เมนู" />
      <PageHeader
        title="รายงานการใช้รถ"
        subtitle={`${fmtDate(new Date(from))} – ${fmtDate(new Date(to))}`}
      />

      <form className="card mb-3 space-y-3" method="get">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="from">
              ตั้งแต่
            </label>
            <input id="from" name="from" type="date" className="input" defaultValue={from} />
          </div>
          <div>
            <label className="label" htmlFor="to">
              ถึง
            </label>
            <input id="to" name="to" type="date" className="input" defaultValue={to} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="v">
            รถ
          </label>
          <select id="v" name="v" className="input" defaultValue={vehicleId}>
            <option value="">ทุกคัน</option>
            {fleet.map((v) => (
              <option key={v.id} value={v.id}>
                {v.brand} {v.model ?? ""} ({v.plateNumber})
              </option>
            ))}
          </select>
        </div>
        <button className="btn-secondary w-full">แสดงรายงาน</button>
      </form>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="card text-center">
          <p className="text-xl font-bold text-slate-900">{rows.length}</p>
          <p className="text-[11px] text-slate-500">ครั้งที่ใช้รถ</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-blue-700">{totalKm.toLocaleString("th-TH")}</p>
          <p className="text-[11px] text-slate-500">ระยะทางรวม (กม.)</p>
        </div>
        <div className="card text-center">
          <p className="text-xl font-bold text-red-600">{damaged}</p>
          <p className="text-[11px] text-slate-500">มีความเสียหาย</p>
        </div>
      </div>

      {kmByVehicle.size > 0 && (
        <div className="card mb-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">ระยะทางแยกตามคัน</h2>
          {fleet
            .filter((v) => kmByVehicle.has(v.id))
            .map((v) => (
              <div
                key={v.id}
                className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0"
              >
                <span className="text-slate-600">
                  {v.brand} {v.model ?? ""}
                </span>
                <span className="font-medium">
                  {(kmByVehicle.get(v.id) ?? 0).toLocaleString("th-TH")} กม.
                </span>
              </div>
            ))}
        </div>
      )}

      {tripsByDriver.size > 0 && (
        <div className="card mb-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">แยกตามผู้ใช้รถ</h2>
          {Array.from(tripsByDriver.values())
            .sort((a, b) => b.km - a.km)
            .map((d) => (
              <div
                key={d.name}
                className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0"
              >
                <span className="text-slate-600">{d.name}</span>
                <span className="font-medium">
                  {d.trips} ครั้ง · {d.km.toLocaleString("th-TH")} กม.
                </span>
              </div>
            ))}
        </div>
      )}

      <a href={`/api/reports/export?${exportQs.toString()}`} className="btn-primary mb-3 w-full">
        ⬇️ ดาวน์โหลด CSV (เปิดใน Excel)
      </a>

      {rows.length === 0 ? (
        <EmptyState text="ไม่พบข้อมูลในช่วงที่เลือก" />
      ) : (
        <div className="space-y-2">
          {rows.map(({ t, v, u }) => {
            const km = t.odometerIn !== null ? t.odometerIn - t.odometerOut : null;
            return (
              <Link key={t.id} href={`/trips/${t.id}`} className="card block hover:border-blue-300">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {t.destination}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t.tripNo} · {u.name} · {v.brand} {v.model ?? ""}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  🕒 {fmtDateTime(t.checkedOutAt)}
                  {km !== null ? ` · ${km.toLocaleString("th-TH")} กม.` : ""}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
