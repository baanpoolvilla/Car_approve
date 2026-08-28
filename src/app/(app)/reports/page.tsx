import Link from "next/link";
import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { inspections, users, vehicleRequests, vehicles } from "@/db/schema";
import { requireRolePage } from "@/lib/auth";
import { fmtDate, fmtRange } from "@/lib/datetime";
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
    gte(vehicleRequests.plannedStartAt, new Date(`${from}T00:00:00+07:00`)),
    lte(vehicleRequests.plannedStartAt, new Date(`${to}T23:59:59+07:00`)),
  ];
  if (vehicleId) conditions.push(eq(vehicleRequests.vehicleId, vehicleId));

  const [rows, fleet, inspectionRows] = await Promise.all([
    db
      .select({ r: vehicleRequests, v: vehicles, u: users })
      .from(vehicleRequests)
      .innerJoin(users, eq(users.id, vehicleRequests.requesterId))
      .leftJoin(vehicles, eq(vehicles.id, vehicleRequests.vehicleId))
      .where(and(...conditions))
      .orderBy(asc(vehicleRequests.plannedStartAt))
      .limit(500),
    db.select().from(vehicles).orderBy(asc(vehicles.brand)),
    db.select().from(inspections),
  ]);

  const odoByRequest = new Map<string, { before?: number; after?: number }>();
  for (const i of inspectionRows) {
    const e = odoByRequest.get(i.requestId) ?? {};
    if (i.phase === "BEFORE") e.before = i.odometer;
    else e.after = i.odometer;
    odoByRequest.set(i.requestId, e);
  }

  const completed = rows.filter((x) => ["COMPLETED", "RETURNED"].includes(x.r.status));
  let totalKm = 0;
  const kmByVehicle = new Map<string, number>();
  for (const { r } of completed) {
    const e = odoByRequest.get(r.id);
    if (e?.before !== undefined && e?.after !== undefined) {
      const d = Math.max(0, e.after - e.before);
      totalKm += d;
      if (r.vehicleId) kmByVehicle.set(r.vehicleId, (kmByVehicle.get(r.vehicleId) ?? 0) + d);
    }
  }
  const damaged = rows.filter((x) => x.r.hasNewDamage).length;

  const exportQs = new URLSearchParams({ from, to, ...(vehicleId ? { vehicleId } : {}) });

  return (
    <div>
      <BackLink href="/more" label="เมนู" />
      <PageHeader title="รายงานการใช้รถ" subtitle={`${fmtDate(new Date(from))} – ${fmtDate(new Date(to))}`} />

      <form className="card mb-3 space-y-3" method="get">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="from">ตั้งแต่</label>
            <input id="from" name="from" type="date" className="input" defaultValue={from} />
          </div>
          <div>
            <label className="label" htmlFor="to">ถึง</label>
            <input id="to" name="to" type="date" className="input" defaultValue={to} />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="v">รถ</label>
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
          <p className="text-[11px] text-slate-500">คำขอทั้งหมด</p>
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
              <div key={v.id} className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0">
                <span className="text-slate-600">
                  {v.brand} {v.model ?? ""}
                </span>
                <span className="font-medium">{(kmByVehicle.get(v.id) ?? 0).toLocaleString("th-TH")} กม.</span>
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
          {rows.map(({ r, v, u }) => {
            const e = odoByRequest.get(r.id);
            const km =
              e?.before !== undefined && e?.after !== undefined ? e.after - e.before : null;
            return (
              <Link key={r.id} href={`/requests/${r.id}`} className="card block hover:border-blue-300">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{r.purpose}</p>
                    <p className="text-xs text-slate-500">
                      {r.requestNo} · {u.name} · {v?.brand ?? "-"} {v?.model ?? ""}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  🕒 {fmtRange(r.plannedStartAt, r.plannedEndAt)}
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
