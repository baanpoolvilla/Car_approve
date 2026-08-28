"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PhotoCapture, { type CapturedPhoto } from "@/components/PhotoCapture";

type Definition = {
  id: string;
  name: string;
  category: string | null;
  isRequired: boolean;
};

type Result = "NORMAL" | "DAMAGED" | "NOT_APPLICABLE";

export default function InspectionForm({
  requestId,
  phase,
  definitions,
  requiredAngles,
  defaultOdometer,
  minOdometer,
  beforeFuel,
}: {
  requestId: string;
  phase: "BEFORE" | "AFTER";
  definitions: Definition[];
  requiredAngles: { code: string; label: string }[];
  defaultOdometer: number;
  minOdometer: number;
  beforeFuel: number | null;
}) {
  const router = useRouter();
  const [odometer, setOdometer] = useState<string>(String(defaultOdometer || ""));
  const [fuelLevel, setFuelLevel] = useState(beforeFuel ?? 50);
  const [answers, setAnswers] = useState<Record<string, { result: Result; note: string }>>(() =>
    Object.fromEntries(definitions.map((d) => [d.id, { result: "NORMAL" as Result, note: "" }]))
  );
  const [damageNote, setDamageNote] = useState("");
  const [anglePhotos, setAnglePhotos] = useState<Record<string, CapturedPhoto[]>>({});
  const [damagePhotos, setDamagePhotos] = useState<CapturedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasDamage = useMemo(
    () => Object.values(answers).some((a) => a.result === "DAMAGED"),
    [answers]
  );

  const missingAngles = requiredAngles.filter((a) => (anglePhotos[a.code]?.length ?? 0) === 0);
  const odoNumber = Number(odometer);
  const odoInvalid =
    !Number.isFinite(odoNumber) || odoNumber < 0 || (phase === "AFTER" && odoNumber < minOdometer);

  const ready =
    !odoInvalid &&
    missingAngles.length === 0 &&
    (!hasDamage || (damagePhotos.length > 0 && damageNote.trim().length > 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const photoIds = [
        ...Object.values(anglePhotos).flat().map((p) => p.id),
        ...damagePhotos.map((p) => p.id),
      ];
      const res = await fetch(`/api/requests/${requestId}/inspection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phase,
          odometer: odoNumber,
          fuelLevel,
          damageNote,
          checklist: definitions.map((d) => ({
            checklistItemId: d.id,
            result: answers[d.id]?.result ?? "NORMAL",
            note: answers[d.id]?.note ?? "",
          })),
          photoIds,
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

  const categories = Array.from(new Set(definitions.map((d) => d.category ?? "อื่น ๆ")));

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">เลขไมล์และน้ำมัน</h2>
        <div>
          <label className="label" htmlFor="odo">
            เลขไมล์ (กม.) *
          </label>
          <input
            id="odo"
            type="number"
            inputMode="numeric"
            className="input"
            required
            min={minOdometer}
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
          />
          {phase === "AFTER" && (
            <p className="mt-1 text-xs text-slate-500">
              ต้องไม่น้อยกว่าเลขไมล์ตอนรับรถ ({minOdometer.toLocaleString("th-TH")} กม.)
            </p>
          )}
          {odoInvalid && odometer !== "" && (
            <p className="mt-1 text-xs text-red-600">เลขไมล์ไม่ถูกต้อง</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="fuel">
            ระดับน้ำมัน: <span className="font-bold text-blue-700">{fuelLevel}%</span>
          </label>
          <input
            id="fuel"
            type="range"
            min={0}
            max={100}
            step={5}
            className="w-full accent-blue-700"
            value={fuelLevel}
            onChange={(e) => setFuelLevel(Number(e.target.value))}
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>E</span>
            <span>1/2</span>
            <span>F</span>
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Checklist สภาพรถ</h2>
        {categories.map((cat) => (
          <div key={cat}>
            <p className="mb-1 text-xs font-medium text-slate-400">{cat}</p>
            <div className="space-y-2">
              {definitions
                .filter((d) => (d.category ?? "อื่น ๆ") === cat)
                .map((d) => {
                  const a = answers[d.id] ?? { result: "NORMAL" as Result, note: "" };
                  return (
                    <div key={d.id} className="rounded-lg border border-slate-200 p-2">
                      <p className="mb-1.5 text-sm text-slate-800">{d.name}</p>
                      <div className="flex gap-1">
                        {(
                          [
                            ["NORMAL", "ปกติ"],
                            ["DAMAGED", "ชำรุด"],
                            ["NOT_APPLICABLE", "ไม่มี"],
                          ] as [Result, string][]
                        ).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setAnswers((s) => ({ ...s, [d.id]: { ...a, result: value } }))
                            }
                            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
                              a.result === value
                                ? value === "DAMAGED"
                                  ? "bg-red-600 text-white"
                                  : "bg-blue-700 text-white"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {a.result === "DAMAGED" && (
                        <input
                          className="input mt-2 text-sm"
                          placeholder="ระบุความเสียหาย"
                          value={a.note}
                          onChange={(e) =>
                            setAnswers((s) => ({ ...s, [d.id]: { ...a, note: e.target.value } }))
                          }
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          รูปถ่ายบังคับ ({requiredAngles.length - missingAngles.length}/{requiredAngles.length})
        </h2>
        {requiredAngles.map((a) => (
          <PhotoCapture
            key={a.code}
            requestId={requestId}
            angle={a.code}
            label={a.label}
            required
            value={anglePhotos[a.code] ?? []}
            onChange={(photos) => setAnglePhotos((s) => ({ ...s, [a.code]: photos }))}
          />
        ))}
      </section>

      {hasDamage && (
        <section className="card space-y-3 border-red-200">
          <h2 className="text-sm font-semibold text-red-700">พบความเสียหาย — ต้องระบุเพิ่มเติม</h2>
          <textarea
            className="input"
            rows={3}
            required
            placeholder="อธิบายความเสียหายที่พบ"
            value={damageNote}
            onChange={(e) => setDamageNote(e.target.value)}
          />
          <PhotoCapture
            requestId={requestId}
            angle="DAMAGE"
            label="รูปจุดเสียหาย (อย่างน้อย 1 รูป)"
            required
            multiple
            value={damagePhotos}
            onChange={setDamagePhotos}
          />
        </section>
      )}

      {!ready && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {missingAngles.length > 0 && (
            <p>ยังถ่ายรูปไม่ครบ: {missingAngles.map((a) => a.label).join(", ")}</p>
          )}
          {hasDamage && damagePhotos.length === 0 && <p>ต้องแนบรูปจุดเสียหายอย่างน้อย 1 รูป</p>}
          {hasDamage && !damageNote.trim() && <p>ต้องระบุรายละเอียดความเสียหาย</p>}
          {odoInvalid && <p>ตรวจสอบเลขไมล์อีกครั้ง</p>}
        </div>
      )}

      <button className="btn-primary w-full py-3" disabled={busy || !ready}>
        {busy
          ? "กำลังบันทึก..."
          : phase === "BEFORE"
            ? "ยืนยันรับรถ"
            : "ยืนยันคืนรถ"}
      </button>
    </form>
  );
}
