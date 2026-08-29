"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhotoCapture, { type CapturedPhoto } from "@/components/PhotoCapture";
import { powerWords } from "@/lib/labels";

export default function ReturnTripForm({
  tripId,
  odometerOut,
  energyOut,
  powerType,
  requiredAngles,
}: {
  tripId: string;
  odometerOut: number;
  energyOut: number;
  powerType: "EV" | "FUEL";
  requiredAngles: { code: string; label: string }[];
}) {
  const router = useRouter();
  const [odometer, setOdometer] = useState(String(odometerOut));
  const [energyLevel, setEnergyLevel] = useState(energyOut);
  const words = powerWords(powerType);
  const [hasDamage, setHasDamage] = useState(false);
  const [damageNote, setDamageNote] = useState("");
  const [anglePhotos, setAnglePhotos] = useState<Record<string, CapturedPhoto[]>>({});
  const [damagePhotos, setDamagePhotos] = useState<CapturedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missingAngles = requiredAngles.filter((a) => (anglePhotos[a.code]?.length ?? 0) === 0);
  const odoNumber = Number(odometer);
  const odoInvalid = !Number.isFinite(odoNumber) || odoNumber < odometerOut;
  const distance = odoInvalid ? null : odoNumber - odometerOut;

  const ready =
    !odoInvalid &&
    missingAngles.length === 0 &&
    (!hasDamage || (damagePhotos.length > 0 && damageNote.trim().length > 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips/${tripId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          odometer: odoNumber,
          energyLevel,
          hasDamage,
          damageNote,
          photoIds: [
            ...Object.values(anglePhotos).flat().map((p) => p.id),
            ...damagePhotos.map((p) => p.id),
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      router.replace(`/trips/${tripId}`);
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
        <h2 className="text-sm font-semibold text-slate-700">1. เลขไมล์และ{words.short}</h2>
        <div>
          <label className="label" htmlFor="odo">
            เลขไมล์ตอนคืน (กม.) *
          </label>
          <input
            id="odo"
            type="number"
            inputMode="numeric"
            className="input"
            required
            min={odometerOut}
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
          />
          {odoInvalid ? (
            <p className="mt-1 text-xs text-red-600">
              ต้องไม่น้อยกว่าตอนเอารถออก ({odometerOut.toLocaleString("th-TH")} กม.)
            </p>
          ) : (
            <p className="mt-1 text-xs text-emerald-700">
              ระยะทางเที่ยวนี้ {distance!.toLocaleString("th-TH")} กม.
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="energy">
            {words.level}: <span className="font-bold text-blue-700">{energyLevel}%</span>
          </label>
          <input
            id="energy"
            type="range"
            min={0}
            max={100}
            step={5}
            className="w-full accent-blue-700"
            value={energyLevel}
            onChange={(e) => setEnergyLevel(Number(e.target.value))}
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            {words.marks.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
          {energyLevel < energyOut && (
            <p className="mt-1 text-xs text-amber-700">
              {words.low} (ตอนรับรถ {energyOut}%)
            </p>
          )}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          2. ถ่ายรูปรอบคัน ({requiredAngles.length - missingAngles.length}/{requiredAngles.length})
        </h2>
        {requiredAngles.map((a) => (
          <PhotoCapture
            key={a.code}
            tripId={tripId}
            angle={a.code}
            label={a.label}
            required
            value={anglePhotos[a.code] ?? []}
            onChange={(photos) => setAnglePhotos((s) => ({ ...s, [a.code]: photos }))}
          />
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">3. สภาพรถ</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setHasDamage(false)}
            className={`flex-1 rounded-lg py-3 text-sm font-medium ${
              hasDamage ? "bg-slate-100 text-slate-600" : "bg-emerald-600 text-white"
            }`}
          >
            ปกติดี
          </button>
          <button
            type="button"
            onClick={() => setHasDamage(true)}
            className={`flex-1 rounded-lg py-3 text-sm font-medium ${
              hasDamage ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            มีความเสียหาย
          </button>
        </div>

        {hasDamage && (
          <>
            <textarea
              className="input"
              rows={3}
              required
              placeholder="อธิบายความเสียหายที่พบ"
              value={damageNote}
              onChange={(e) => setDamageNote(e.target.value)}
            />
            <PhotoCapture
              tripId={tripId}
              angle="DAMAGE"
              label="รูปจุดเสียหาย (อย่างน้อย 1 รูป)"
              required
              multiple
              value={damagePhotos}
              onChange={setDamagePhotos}
            />
          </>
        )}
      </section>

      {!ready && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {missingAngles.length > 0 && (
            <p>ยังถ่ายรูปไม่ครบ: {missingAngles.map((a) => a.label).join(", ")}</p>
          )}
          {odoInvalid && <p>ตรวจสอบเลขไมล์อีกครั้ง</p>}
          {hasDamage && !damageNote.trim() && <p>ต้องระบุรายละเอียดความเสียหาย</p>}
          {hasDamage && damagePhotos.length === 0 && <p>ต้องแนบรูปจุดเสียหายอย่างน้อย 1 รูป</p>}
        </div>
      )}

      <button className="btn-primary w-full py-3" disabled={busy || !ready}>
        {busy ? "กำลังบันทึก..." : "🏁 ยืนยันคืนรถ"}
      </button>
    </form>
  );
}
