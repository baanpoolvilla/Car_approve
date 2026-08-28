import { body, ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp } from "@/lib/audit";
import { createAndSubmitRequest } from "@/lib/workflow";
import { fromBangkokInput } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  vehicleId: string;
  start: string;
  end: string;
  purpose: string;
  destination: string;
  passengerCount: number;
  passengers?: string;
  note?: string;
  acceptTerms: boolean;
};

export const POST = route(async (req) => {
  const user = await requireUser();
  const p = await body<Payload>(req);

  const created = await createAndSubmitRequest(
    user,
    {
      vehicleId: p.vehicleId,
      plannedStartAt: fromBangkokInput(p.start),
      plannedEndAt: fromBangkokInput(p.end),
      purpose: p.purpose ?? "",
      destination: p.destination ?? "",
      passengerCount: Number(p.passengerCount) || 1,
      passengers: p.passengers,
      note: p.note,
    },
    { acceptTerms: Boolean(p.acceptTerms), ip: await clientIp() }
  );

  return ok({ id: created.id, requestNo: created.requestNo }, 201);
});
