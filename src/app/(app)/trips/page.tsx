import Link from "next/link";
import { requireUserPage, isFleet } from "@/lib/auth";
import { listTrips } from "@/lib/queries";
import TripCard from "@/components/TripCard";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const user = await requireUserPage();
  const { scope = "mine" } = await searchParams;

  const canSeeAll = isFleet(user) || user.roles.includes("APPROVER") || user.roles.includes("AUDITOR");
  const showAll = scope === "all" && canSeeAll;

  const rows = await listTrips({
    driverId: showAll ? undefined : user.id,
    limit: 100,
  });

  return (
    <div>
      <PageHeader
        title="ประวัติการใช้รถ"
        subtitle={showAll ? "ทุกคนในบริษัท" : "ของฉัน"}
        action={
          <Link href="/trips/new" className="btn-primary">
            🚗 เอารถออก
          </Link>
        }
      />

      {canSeeAll && (
        <div className="mb-3 flex gap-1 rounded-lg bg-slate-200 p-1">
          <Link
            href="/trips"
            className={`flex-1 rounded-md py-1.5 text-center text-sm ${
              showAll ? "text-slate-600" : "bg-white font-medium text-slate-900 shadow-sm"
            }`}
          >
            ของฉัน
          </Link>
          <Link
            href="/trips?scope=all"
            className={`flex-1 rounded-md py-1.5 text-center text-sm ${
              showAll ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600"
            }`}
          >
            ทั้งบริษัท
          </Link>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          text="ยังไม่มีประวัติการใช้รถ"
          cta={
            <Link href="/trips/new" className="btn-secondary">
              เอารถออก
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {rows.map((t) => (
            <TripCard key={t.id} t={t} showDriver={showAll} />
          ))}
        </div>
      )}
    </div>
  );
}
