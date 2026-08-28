import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { requireUserPage } from "@/lib/auth";
import { listRequests } from "@/lib/queries";
import { fmtTime, fmtDate } from "@/lib/datetime";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; days?: string }>;
}) {
  await requireUserPage();
  const { v: vehicleFilter, days } = await searchParams;
  const span = Number(days) === 60 ? 60 : 30;

  const from = new Date();
  const to = new Date(Date.now() + span * DAY_MS);

  const [fleet, rows] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.isActive, true)).orderBy(vehicles.brand),
    listRequests({
      vehicleId: vehicleFilter || undefined,
      statuses: ["PENDING_APPROVAL", "APPROVED", "CHECKED_OUT", "RETURNED"],
      from,
      to,
      order: "asc",
      limit: 300,
    }),
  ]);

  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = dayKey(r.plannedStartAt);
    const list = byDay.get(key) ?? [];
    list.push(r);
    byDay.set(key, list);
  }
  const orderedDays = Array.from(byDay.keys()).sort();

  return (
    <div>
      <PageHeader title="ปฏิทินการใช้รถ" subtitle={`${span} วันข้างหน้า`} />

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link
          href="/calendar"
          className={`chip whitespace-nowrap border px-3 py-1.5 ${
            !vehicleFilter ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          ทุกคัน
        </Link>
        {fleet.map((v) => (
          <Link
            key={v.id}
            href={`/calendar?v=${v.id}`}
            className={`chip whitespace-nowrap border px-3 py-1.5 ${
              vehicleFilter === v.id
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {v.brand} {v.model ?? ""}
          </Link>
        ))}
      </div>

      {orderedDays.length === 0 ? (
        <EmptyState text="ยังไม่มีการจองในช่วงนี้" />
      ) : (
        <div className="space-y-4">
          {orderedDays.map((key) => (
            <section key={key}>
              <h2 className="mb-2 text-sm font-semibold text-slate-700">
                {fmtDate(new Date(`${key}T00:00:00+07:00`))}
              </h2>
              <div className="space-y-2">
                {byDay.get(key)!.map((r) => (
                  <Link key={r.id} href={`/requests/${r.id}`} className="card block hover:border-blue-300">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {fmtTime(r.plannedStartAt)} – {fmtTime(r.plannedEndAt)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-600">
                          {r.vehicleBrand} {r.vehicleModel ?? ""} · {r.requesterName}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {r.purpose} → {r.destination}
                        </p>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="mt-4 text-center">
        <Link href={`/calendar?${vehicleFilter ? `v=${vehicleFilter}&` : ""}days=${span === 30 ? 60 : 30}`} className="text-xs text-blue-700">
          {span === 30 ? "ดู 60 วัน" : "ดู 30 วัน"}
        </Link>
      </div>
    </div>
  );
}
