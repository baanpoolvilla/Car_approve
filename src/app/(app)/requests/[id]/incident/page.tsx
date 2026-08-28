import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vehicleRequests } from "@/db/schema";
import { isFleet, requireUserPage } from "@/lib/auth";
import { BackLink, PageHeader } from "@/components/ui";
import IncidentForm from "./IncidentForm";

export const dynamic = "force-dynamic";

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  const { id } = await params;

  const request = await db.query.vehicleRequests.findFirst({
    where: eq(vehicleRequests.id, id),
  });
  if (!request) notFound();
  if (request.requesterId !== user.id && !isFleet(user)) redirect(`/requests/${id}`);

  return (
    <div>
      <BackLink href={`/requests/${id}`} label="รายละเอียดคำขอ" />
      <PageHeader title="แจ้งอุบัติเหตุ / เหตุผิดปกติ" subtitle={request.requestNo} />
      <IncidentForm requestId={id} />
    </div>
  );
}
