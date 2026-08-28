import Link from "next/link";
import { requireUserPage, isFleet, isApprover } from "@/lib/auth";
import { listRequests } from "@/lib/queries";
import type { RequestStatus } from "@/db/schema";
import RequestCard from "@/components/RequestCard";
import { EmptyState, PageHeader, STATUS_LABEL } from "@/components/ui";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string; statuses?: RequestStatus[] }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "active", label: "กำลังดำเนินการ", statuses: ["PENDING_APPROVAL", "APPROVED", "CHECKED_OUT", "RETURNED"] },
  { key: "PENDING_APPROVAL", label: STATUS_LABEL.PENDING_APPROVAL, statuses: ["PENDING_APPROVAL"] },
  { key: "APPROVED", label: STATUS_LABEL.APPROVED, statuses: ["APPROVED"] },
  { key: "CHECKED_OUT", label: STATUS_LABEL.CHECKED_OUT, statuses: ["CHECKED_OUT"] },
  { key: "COMPLETED", label: STATUS_LABEL.COMPLETED, statuses: ["COMPLETED"] },
  { key: "REJECTED", label: STATUS_LABEL.REJECTED, statuses: ["REJECTED"] },
  { key: "CANCELLED", label: STATUS_LABEL.CANCELLED, statuses: ["CANCELLED"] },
];

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; scope?: string }>;
}) {
  const user = await requireUserPage();
  const { f = "all", scope = "mine" } = await searchParams;

  const canSeeAll = isFleet(user) || isApprover(user) || user.roles.includes("AUDITOR");
  const showAll = scope === "all" && canSeeAll;
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];

  const rows = await listRequests({
    requesterId: showAll ? undefined : user.id,
    statuses: filter.statuses,
    limit: 100,
  });

  const qs = (next: Record<string, string>) => {
    const p = new URLSearchParams({ f, scope, ...next });
    return `/requests?${p.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="รายการคำขอ"
        subtitle={showAll ? "ทุกคนในบริษัท" : "คำขอของฉัน"}
        action={
          <Link href="/requests/new" className="btn-primary">
            ➕ ขอใช้รถ
          </Link>
        }
      />

      {canSeeAll && (
        <div className="mb-3 flex gap-1 rounded-lg bg-slate-200 p-1">
          <Link
            href={qs({ scope: "mine" })}
            className={`flex-1 rounded-md py-1.5 text-center text-sm ${
              showAll ? "text-slate-600" : "bg-white font-medium text-slate-900 shadow-sm"
            }`}
          >
            ของฉัน
          </Link>
          <Link
            href={qs({ scope: "all" })}
            className={`flex-1 rounded-md py-1.5 text-center text-sm ${
              showAll ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            ทั้งบริษัท
          </Link>
        </div>
      )}

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={qs({ f: x.key })}
            className={`chip whitespace-nowrap border px-3 py-1.5 ${
              x.key === filter.key
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState text="ไม่พบรายการ" />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <RequestCard key={r.id} r={r} showRequester={showAll} />
          ))}
        </div>
      )}
    </div>
  );
}
