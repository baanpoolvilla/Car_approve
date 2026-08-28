import { requireRolePage } from "@/lib/auth";
import { listRequests } from "@/lib/queries";
import RequestCard from "@/components/RequestCard";
import { BackLink, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FleetReturnsPage() {
  await requireRolePage("FLEET_MANAGER");
  const rows = await listRequests({ statuses: ["RETURNED"], order: "asc", limit: 100 });

  return (
    <div>
      <BackLink href="/fleet" label="Fleet Dashboard" />
      <PageHeader title="คืนรถรอตรวจ" subtitle="ตรวจสอบความเสียหายและปิดงาน" />
      {rows.length === 0 ? (
        <EmptyState text="ไม่มีรายการรอตรวจ" />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => <RequestCard key={r.id} r={r} showRequester />)}
        </div>
      )}
    </div>
  );
}
