import { body, ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp } from "@/lib/audit";
import { startTrip } from "@/lib/trips";
import { fromBangkokInput } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  vehicleId: string;
  purpose: string;
  destination: string;
  passengerCount: number;
  passengers?: string;
  note?: string;
  expectedReturnAt?: string;
  odometer: number;
  energyLevel: number;
  photoIds?: string[];
  acceptTerms?: boolean;
};

export const POST = route(async (req) => {
  const user = await requireUser();
  const p = await body<Payload>(req);

  const trip = await startTrip(
    user,
    {
      vehicleId: p.vehicleId,
      purpose: p.purpose ?? "",
      destination: p.destination ?? "",
      passengerCount: Number(p.passengerCount) || 1,
      passengers: p.passengers,
      note: p.note,
      expectedReturnAt: p.expectedReturnAt ? fromBangkokInput(p.expectedReturnAt) : null,
      odometer: Number(p.odometer),
      energyLevel: Number(p.energyLevel),
      photoIds: p.photoIds ?? [],
      acceptTerms: Boolean(p.acceptTerms),
    },
    await clientIp()
  );

  return ok({ id: trip.id, tripNo: trip.tripNo }, 201);
});
