"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TripStatus } from "@/db/schema";

export default function TripActions({
  tripId,
  status,
  isDriver,
  canManage,
}: {
  tripId: string;
  status: TripStatus;
  isDriver: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");

  if (status !== "IN_USE" || (!isDriver && !canManage)) return null;

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ดำเนินการไม่สำเร็จ");
      router.refresh();
      setCancelling(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <Link href={`/trips/${tripId}/return`} className="btn-primary w-full py-3">
        🏁 คืนรถ
      </Link>

      {cancelling ? (
        <div className="space-y-2">
          <input
            className="input"
            placeholder="เหตุผลที่ยกเลิก เช่น กดผิด"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn-danger flex-1" disabled={busy || !reason.trim()} onClick={cancel}>
              ยืนยันยกเลิก
            </button>
            <button className="btn-secondary flex-1" onClick={() => setCancelling(false)} disabled={busy}>
              ปิด
            </button>
          </div>
        </div>
      ) : (
        <button className="btn-secondary w-full" onClick={() => setCancelling(true)}>
          ยกเลิกรายการนี้ (กดผิด/ไม่ได้เอารถออก)
        </button>
      )}
    </div>
  );
}
