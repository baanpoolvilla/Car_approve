import Link from "next/link";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { approvalSteps, vehicleRequests, vehicles } from "@/db/schema";
import { requireUserPage, isApprover, isFleet } from "@/lib/auth";
import { listRequests } from "@/lib/queries";
import RequestCard from "@/components/RequestCard";
import { EmptyState, VehicleBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await requireUserPage();
  const { denied } = await searchParams;

  const [toCheckout, inUse, waiting, upcoming, fleetVehicles] = await Promise.all([
    listRequests({ requesterId: user.id, statuses: ["APPROVED"], order: "asc", limit: 10 }),
    listRequests({ requesterId: user.id, statuses: ["CHECKED_OUT"], order: "asc", limit: 10 }),
    listRequests({ requesterId: user.id, statuses: ["PENDING_APPROVAL"], order: "asc", limit: 10 }),
    listRequests({
      requesterId: user.id,
      statuses: ["APPROVED", "CHECKED_OUT"],
      from: new Date(),
      order: "asc",
      limit: 5,
    }),
    db.select().from(vehicles).where(eq(vehicles.isActive, true)).orderBy(vehicles.brand),
  ]);

  const [approvalCount] = isApprover(user)
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(approvalSteps)
        .where(and(eq(approvalSteps.approverId, user.id), eq(approvalSteps.status, "PENDING")))
    : [{ n: 0 }];

  const [returnedCount] = isFleet(user)
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(vehicleRequests)
        .where(eq(vehicleRequests.status, "RETURNED"))
    : [{ n: 0 }];

  return (
    <div className="space-y-5">
      {denied && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          คุณไม่มีสิทธิ์เข้าถึงหน้าที่ร้องขอ
        </div>
      )}

      <div>
        <p className="text-sm text-slate-500">สวัสดี</p>
        <h1 className="text-xl font-bold text-slate-900">{user.name}</h1>
      </div>

      <Link href="/requests/new" className="btn-primary w-full py-3 text-base">
        ➕ ขอใช้รถ
      </Link>

      {(approvalCount.n > 0 || returnedCount.n > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {approvalCount.n > 0 && (
            <Link href="/approvals" className="card text-center">
              <p className="text-2xl font-bold text-amber-600">{approvalCount.n}</p>
              <p className="text-xs text-slate-500">คำขอรออนุมัติ</p>
            </Link>
          )}
          {returnedCount.n > 0 && (
            <Link href="/fleet/returns" className="card text-center">
              <p className="text-2xl font-bold text-orange-600">{returnedCount.n}</p>
              <p className="text-xs text-slate-500">คืนรถรอตรวจ</p>
            </Link>
          )}
        </div>
      )}

      {inUse.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">🚙 กำลังใช้งาน – ต้องคืนรถ</h2>
          <div className="space-y-2">
            {inUse.map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}

      {toCheckout.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">✅ อนุมัติแล้ว – รอรับรถ</h2>
          <div className="space-y-2">
            {toCheckout.map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}

      {waiting.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">⏳ รออนุมัติ</h2>
          <div className="space-y-2">
            {waiting.map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </div>
        </section>
      )}

      {inUse.length === 0 && toCheckout.length === 0 && waiting.length === 0 && (
        <EmptyState
          text="ยังไม่มีรายการที่ต้องดำเนินการ"
          cta={
            <Link href="/requests/new" className="btn-secondary">
              สร้างคำขอใช้รถ
            </Link>
          }
        />
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">สถานะรถ</h2>
          <Link href="/calendar" className="text-xs text-blue-700">
            ดูปฏิทิน →
          </Link>
        </div>
        <div className="space-y-2">
          {fleetVehicles.map((v) => (
            <div key={v.id} className="card flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {v.brand} {v.model ?? ""}
                </p>
                <p className="text-xs text-slate-500">
                  {v.plateNumber} · {v.currentOdometer.toLocaleString("th-TH")} กม.
                </p>
              </div>
              <VehicleBadge status={v.status} />
            </div>
          ))}
        </div>
      </section>

      {upcoming.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          ทริปถัดไปของคุณเริ่ม {new Intl.DateTimeFormat("th-TH", {
            timeZone: "Asia/Bangkok",
            dateStyle: "medium",
            timeStyle: "short",
          }).format(upcoming[0].plannedStartAt)} น.
        </p>
      )}
    </div>
  );
}
