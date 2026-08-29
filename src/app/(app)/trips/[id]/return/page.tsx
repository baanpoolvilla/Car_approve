import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trips, vehicles } from "@/db/schema";
import { isFleet, requireUserPage } from "@/lib/auth";
import { ANGLE_LABEL, getRequiredAngles } from "@/lib/settings";
import { fmtDateTime } from "@/lib/datetime";
import { BackLink, PageHeader } from "@/components/ui";
import ReturnTripForm from "./ReturnTripForm";

export const dynamic = "force-dynamic";

export default async function ReturnTripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  const { id } = await params;

  const rows = await db
    .select({ t: trips, v: vehicles })
    .from(trips)
    .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(eq(trips.id, id))
    .limit(1);
  if (rows.length === 0) notFound();
  const { t, v } = rows[0];

  if (t.driverId !== user.id && !isFleet(user)) redirect(`/trips/${id}`);
  if (t.status !== "IN_USE") redirect(`/trips/${id}`);

  const requiredAngles = await getRequiredAngles();

  return (
    <div>
      <BackLink href={`/trips/${id}`} label="รายละเอียด" />
      <PageHeader title="คืนรถ" subtitle={`${t.tripNo} · ${v.brand} ${v.model ?? ""} ${v.plateNumber}`} />
      <p className="mb-3 text-xs text-slate-500">
        เอารถออกเมื่อ {fmtDateTime(t.checkedOutAt)} · เลขไมล์ {t.odometerOut.toLocaleString("th-TH")} กม. · น้ำมัน {t.fuelOut}%
      </p>
      <ReturnTripForm
        tripId={id}
        odometerOut={t.odometerOut}
        fuelOut={t.fuelOut}
        requiredAngles={requiredAngles.map((a) => ({ code: a, label: ANGLE_LABEL[a] ?? a }))}
      />
    </div>
  );
}
