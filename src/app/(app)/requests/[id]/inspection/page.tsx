import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { checklistDefinitions, inspections, users, vehicleRequests, vehicles } from "@/db/schema";
import { requireUserPage, isFleet } from "@/lib/auth";
import { ANGLE_LABEL, getRequiredAngles } from "@/lib/settings";
import { fmtRange } from "@/lib/datetime";
import { BackLink, PageHeader } from "@/components/ui";
import InspectionForm from "./InspectionForm";

export const dynamic = "force-dynamic";

export default async function InspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ phase?: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;
  const { phase: phaseParam } = await searchParams;
  const phase = phaseParam === "AFTER" ? "AFTER" : "BEFORE";

  const rows = await db
    .select({ r: vehicleRequests, v: vehicles, u: users })
    .from(vehicleRequests)
    .innerJoin(users, eq(users.id, vehicleRequests.requesterId))
    .leftJoin(vehicles, eq(vehicles.id, vehicleRequests.vehicleId))
    .where(eq(vehicleRequests.id, id))
    .limit(1);
  if (rows.length === 0) notFound();
  const { r, v } = rows[0];

  if (r.requesterId !== user.id && !isFleet(user)) redirect(`/requests/${id}`);
  if (phase === "BEFORE" && r.status !== "APPROVED") redirect(`/requests/${id}`);
  if (phase === "AFTER" && r.status !== "CHECKED_OUT") redirect(`/requests/${id}`);

  const [definitions, before, requiredAngles] = await Promise.all([
    db
      .select()
      .from(checklistDefinitions)
      .where(eq(checklistDefinitions.isActive, true))
      .orderBy(asc(checklistDefinitions.sortOrder)),
    db.query.inspections.findFirst({
      where: and(eq(inspections.requestId, id), eq(inspections.phase, "BEFORE")),
    }),
    getRequiredAngles(),
  ]);

  return (
    <div>
      <BackLink href={`/requests/${id}`} label="รายละเอียดคำขอ" />
      <PageHeader
        title={phase === "BEFORE" ? "ตรวจรถก่อนใช้" : "ตรวจรถหลังใช้ / คืนรถ"}
        subtitle={`${r.requestNo} · ${v?.brand ?? ""} ${v?.model ?? ""} ${v?.plateNumber ?? ""}`}
      />
      <p className="mb-3 text-xs text-slate-500">{fmtRange(r.plannedStartAt, r.plannedEndAt)}</p>

      <InspectionForm
        requestId={id}
        phase={phase}
        definitions={definitions.map((d) => ({
          id: d.id,
          name: d.name,
          category: d.category,
          isRequired: d.isRequired,
        }))}
        requiredAngles={requiredAngles.map((a) => ({ code: a, label: ANGLE_LABEL[a] ?? a }))}
        defaultOdometer={
          phase === "BEFORE" ? (v?.currentOdometer ?? 0) : (before?.odometer ?? v?.currentOdometer ?? 0)
        }
        minOdometer={phase === "AFTER" ? (before?.odometer ?? 0) : 0}
        beforeFuel={phase === "AFTER" ? (before?.fuelLevel ?? null) : null}
      />
    </div>
  );
}
