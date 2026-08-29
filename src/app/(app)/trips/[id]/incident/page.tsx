import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { trips } from "@/db/schema";
import { isFleet, requireUserPage } from "@/lib/auth";
import { BackLink, PageHeader } from "@/components/ui";
import IncidentForm from "./IncidentForm";

export const dynamic = "force-dynamic";

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  const { id } = await params;

  const trip = await db.query.trips.findFirst({ where: eq(trips.id, id) });
  if (!trip) notFound();
  if (trip.driverId !== user.id && !isFleet(user)) redirect(`/trips/${id}`);

  return (
    <div>
      <BackLink href={`/trips/${id}`} label="รายละเอียด" />
      <PageHeader title="แจ้งอุบัติเหตุ / เหตุผิดปกติ" subtitle={trip.tripNo} />
      <IncidentForm tripId={id} />
    </div>
  );
}
