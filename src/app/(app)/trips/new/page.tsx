import { redirect } from "next/navigation";
import { requireUserPage } from "@/lib/auth";
import { findOpenTrip, listVehicleStatus } from "@/lib/trips";
import { ANGLE_LABEL, getRequiredAngles } from "@/lib/settings";
import { BackLink, PageHeader } from "@/components/ui";
import StartTripForm from "./StartTripForm";

export const dynamic = "force-dynamic";

export default async function NewTripPage() {
  const user = await requireUserPage();

  const open = await findOpenTrip(user.id);
  if (open) redirect(`/trips/${open.id}/return`);

  const [fleet, requiredAngles] = await Promise.all([listVehicleStatus(), getRequiredAngles()]);

  return (
    <div>
      <BackLink href="/" label="หน้าหลัก" />
      <PageHeader title="เอารถออก" subtitle="บันทึกก่อนนำรถออกจากบริษัท" />
      <StartTripForm
        vehicles={fleet.map((f) => ({
          id: f.vehicle.id,
          brand: f.vehicle.brand,
          model: f.vehicle.model,
          plateNumber: f.vehicle.plateNumber,
          seats: f.vehicle.seats,
          currentOdometer: f.vehicle.currentOdometer,
          powerType: f.vehicle.powerType,
          available: f.available,
          usedBy: f.openTrip?.driverName ?? null,
          blockReason: f.block?.reason ?? null,
        }))}
        requiredAngles={requiredAngles.map((a) => ({ code: a, label: ANGLE_LABEL[a] ?? a }))}
      />
    </div>
  );
}
