"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhotoCapture, { type CapturedPhoto } from "@/components/PhotoCapture";

function nowLocal() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export default function IncidentForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [severity, setSeverity] = useState<"MINOR" | "MODERATE" | "MAJOR">("MINOR");
  const [occurredAt, setOccurredAt] = useState(() => nowLocal());
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [thirdParty, setThirdParty] = useState("");
  const [policeReportNo, setPoliceReportNo] = useState("");
  const [insuranceClaimNo, setInsuranceClaimNo] = useState("");
  const [pics, setPics] = useState<CapturedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          severity,
          occurredAt,
          location,
          description,
          thirdParty,
          policeReportNo,
          insuranceClaimNo,
          photoIds: pics.map((p) => p.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      router.replace(`/requests/${requestId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="card space-y-3">
        <div>
          <span className="label">ความรุนแรง</span>
          <div className="flex gap-1">
            {(
              [
                ["MINOR", "เล็กน้อย"],
                ["MODERATE", "ปานกลาง"],
                ["MAJOR", "รุนแรง"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSeverity(value)}
                className={`flex-1 rounded-md px-2 py-2 text-sm font-medium ${
                  severity === value ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="occurred">
            วันเวลาที่เกิดเหตุ *
          </label>
          <input
            id="occurred"
            type="datetime-local"
            className="input"
            required
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="loc">
            สถานที่
          </label>
          <input
            id="loc"
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="เช่น ถนนเทพกระษัตรี กม.12"
          />
        </div>

        <div>
          <label className="label" htmlFor="desc">
            รายละเอียดเหตุการณ์ *
          </label>
          <textarea
            id="desc"
            className="input"
            rows={4}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="tp">
            คู่กรณี (ชื่อ / ทะเบียน / เบอร์ติดต่อ)
          </label>
          <input
            id="tp"
            className="input"
            value={thirdParty}
            onChange={(e) => setThirdParty(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label" htmlFor="police">
              เลขบันทึกประจำวัน
            </label>
            <input
              id="police"
              className="input"
              value={policeReportNo}
              onChange={(e) => setPoliceReportNo(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="claim">
              เลขเคลมประกัน
            </label>
            <input
              id="claim"
              className="input"
              value={insuranceClaimNo}
              onChange={(e) => setInsuranceClaimNo(e.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="card">
        <PhotoCapture
          requestId={requestId}
          angle="DAMAGE"
          label="รูปที่เกิดเหตุ / ความเสียหาย"
          multiple
          value={pics}
          onChange={setPics}
        />
      </section>

      <button className="btn-danger w-full py-3" disabled={busy || !description.trim()}>
        {busy ? "กำลังบันทึก..." : "บันทึกรายงานเหตุ"}
      </button>
    </form>
  );
}
