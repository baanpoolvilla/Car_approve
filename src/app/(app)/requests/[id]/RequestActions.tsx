"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RequestStatus } from "@/db/schema";

export default function RequestActions({
  requestId,
  status,
  isOwner,
  canManage,
  pendingStepId,
}: {
  requestId: string;
  status: RequestStatus;
  isOwner: boolean;
  canManage: boolean;
  pendingStepId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  async function post(url: string, payload: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ดำเนินการไม่สำเร็จ");
      router.refresh();
      setCancelling(false);
      setComment("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const canCancel =
    (isOwner || canManage) && ["PENDING_APPROVAL", "APPROVED", "DRAFT"].includes(status);

  const nothingToDo =
    !pendingStepId &&
    !canCancel &&
    !(isOwner && (status === "APPROVED" || status === "CHECKED_OUT")) &&
    !(canManage && status === "RETURNED");

  if (nothingToDo) return null;

  return (
    <div className="card space-y-3">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {pendingStepId && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">การอนุมัติของคุณ</h2>
          <textarea
            className="input"
            rows={2}
            placeholder="ความคิดเห็น (บังคับเมื่อไม่อนุมัติ)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="btn-success flex-1"
              disabled={busy}
              onClick={() =>
                post(`/api/approval-steps/${pendingStepId}/decide`, {
                  decision: "APPROVED",
                  comment,
                })
              }
            >
              ✅ อนุมัติ
            </button>
            <button
              className="btn-danger flex-1"
              disabled={busy}
              onClick={() =>
                post(`/api/approval-steps/${pendingStepId}/decide`, {
                  decision: "REJECTED",
                  comment,
                })
              }
            >
              ✕ ไม่อนุมัติ
            </button>
          </div>
        </div>
      )}

      {isOwner && status === "APPROVED" && (
        <Link href={`/requests/${requestId}/inspection?phase=BEFORE`} className="btn-primary w-full py-3">
          🔎 ตรวจรถและรับรถ
        </Link>
      )}

      {isOwner && status === "CHECKED_OUT" && (
        <>
          <Link
            href={`/requests/${requestId}/inspection?phase=AFTER`}
            className="btn-primary w-full py-3"
          >
            🏁 ตรวจรถและคืนรถ
          </Link>
          <Link href={`/requests/${requestId}/incident`} className="btn-secondary w-full">
            ⚠️ แจ้งอุบัติเหตุ / เหตุผิดปกติ
          </Link>
        </>
      )}

      {canManage && status === "RETURNED" && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">ตรวจรับและปิดงาน (Fleet Manager)</h2>
          <textarea
            className="input"
            rows={2}
            placeholder="บันทึกผลการตรวจ / การซ่อม"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button
            className="btn-success w-full"
            disabled={busy}
            onClick={() => post(`/api/requests/${requestId}/complete`, { note: comment })}
          >
            ปิดงาน
          </button>
        </div>
      )}

      {canCancel &&
        (cancelling ? (
          <div className="space-y-2">
            <input
              className="input"
              placeholder="เหตุผลที่ยกเลิก"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="btn-danger flex-1"
                disabled={busy}
                onClick={() => post(`/api/requests/${requestId}/cancel`, { reason: cancelReason })}
              >
                ยืนยันยกเลิก
              </button>
              <button
                className="btn-secondary flex-1"
                onClick={() => setCancelling(false)}
                disabled={busy}
              >
                ปิด
              </button>
            </div>
          </div>
        ) : (
          <button className="btn-secondary w-full" onClick={() => setCancelling(true)}>
            ยกเลิกคำขอ
          </button>
        ))}
    </div>
  );
}
