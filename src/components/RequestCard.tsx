import Link from "next/link";
import { fmtRange } from "@/lib/datetime";
import type { RequestListRow } from "@/lib/queries";
import { StatusBadge } from "./ui";

export default function RequestCard({
  r,
  showRequester = false,
}: {
  r: RequestListRow;
  showRequester?: boolean;
}) {
  return (
    <Link href={`/requests/${r.id}`} className="card block hover:border-blue-300">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{r.purpose}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {r.requestNo} · {r.vehicleBrand ?? "-"} {r.vehicleModel ?? ""}
            {r.vehiclePlate ? ` (${r.vehiclePlate})` : ""}
          </p>
        </div>
        <StatusBadge status={r.status} />
      </div>
      <div className="mt-2 space-y-0.5 text-xs text-slate-600">
        <p>🕒 {fmtRange(r.plannedStartAt, r.plannedEndAt)}</p>
        <p>📍 {r.destination}</p>
        {showRequester && <p>👤 {r.requesterName}</p>}
        {r.hasNewDamage && <p className="font-medium text-red-600">⚠️ มีรายงานความเสียหาย</p>}
      </div>
    </Link>
  );
}
