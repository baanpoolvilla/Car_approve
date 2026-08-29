import Link from "next/link";
import { fmtDateTime } from "@/lib/datetime";
import type { TripListRow } from "@/lib/queries";
import { StatusBadge } from "./ui";

export default function TripCard({
  t,
  showDriver = false,
}: {
  t: TripListRow;
  showDriver?: boolean;
}) {
  const distance = t.odometerIn !== null ? t.odometerIn - t.odometerOut : null;

  return (
    <Link href={`/trips/${t.id}`} className="card block hover:border-blue-300">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {t.vehicleBrand} {t.vehicleModel ?? ""}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {t.tripNo} · {t.vehiclePlate}
          </p>
        </div>
        <StatusBadge status={t.status} />
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-slate-600">
        <p>📍 {t.destination} · {t.purpose}</p>
        <p>🕒 ออก {fmtDateTime(t.checkedOutAt)}</p>
        {t.returnedAt && <p>🏁 คืน {fmtDateTime(t.returnedAt)}</p>}
        {distance !== null && <p>🛣️ {distance.toLocaleString("th-TH")} กม.</p>}
        {showDriver && <p>👤 {t.driverName}</p>}
        {t.hasDamage && <p className="font-medium text-red-600">⚠️ แจ้งความเสียหาย</p>}
      </div>
    </Link>
  );
}
