import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { approvalSteps, users, vehicleRequests, vehicles } from "@/db/schema";
import { requireRolePage } from "@/lib/auth";
import { fmtDateTime, fmtRange } from "@/lib/datetime";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireRolePage("APPROVER");
  const { tab = "pending" } = await searchParams;
  const pending = tab !== "history";

  const rows = await db
    .select({
      stepId: approvalSteps.id,
      stepStatus: approvalSteps.status,
      actedAt: approvalSteps.actedAt,
      comment: approvalSteps.decisionComment,
      r: vehicleRequests,
      requester: users.name,
      vBrand: vehicles.brand,
      vModel: vehicles.model,
      vPlate: vehicles.plateNumber,
    })
    .from(approvalSteps)
    .innerJoin(vehicleRequests, eq(vehicleRequests.id, approvalSteps.requestId))
    .innerJoin(users, eq(users.id, vehicleRequests.requesterId))
    .leftJoin(vehicles, eq(vehicles.id, vehicleRequests.vehicleId))
    .where(
      and(
        eq(approvalSteps.approverId, user.id),
        pending ? eq(approvalSteps.status, "PENDING") : undefined
      )
    )
    .orderBy(pending ? asc(vehicleRequests.plannedStartAt) : desc(approvalSteps.actedAt))
    .limit(100);

  const visible = pending ? rows : rows.filter((x) => x.stepStatus !== "PENDING");

  return (
    <div>
      <PageHeader title="คำขออนุมัติ" subtitle={pending ? "รอการตัดสินใจของคุณ" : "ประวัติการอนุมัติ"} />

      <div className="mb-3 flex gap-1 rounded-lg bg-slate-200 p-1">
        <Link
          href="/approvals"
          className={`flex-1 rounded-md py-1.5 text-center text-sm ${
            pending ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          รออนุมัติ
        </Link>
        <Link
          href="/approvals?tab=history"
          className={`flex-1 rounded-md py-1.5 text-center text-sm ${
            pending ? "text-slate-600" : "bg-white font-medium text-slate-900 shadow-sm"
          }`}
        >
          ประวัติ
        </Link>
      </div>

      {visible.length === 0 ? (
        <EmptyState text={pending ? "ไม่มีคำขอรออนุมัติ" : "ยังไม่มีประวัติการอนุมัติ"} />
      ) : (
        <div className="space-y-2">
          {visible.map((x) => (
            <Link key={x.stepId} href={`/requests/${x.r.id}`} className="card block hover:border-blue-300">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{x.r.purpose}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {x.r.requestNo} · {x.requester}
                  </p>
                </div>
                <StatusBadge status={x.r.status} />
              </div>
              <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                <p>🚗 {x.vBrand ?? "-"} {x.vModel ?? ""} {x.vPlate ? `(${x.vPlate})` : ""}</p>
                <p>🕒 {fmtRange(x.r.plannedStartAt, x.r.plannedEndAt)}</p>
                <p>📍 {x.r.destination} · {x.r.passengerCount} คน</p>
                {!pending && x.actedAt && (
                  <p className="text-slate-400">
                    ตัดสินใจเมื่อ {fmtDateTime(x.actedAt)}
                    {x.comment ? ` · ${x.comment}` : ""}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
