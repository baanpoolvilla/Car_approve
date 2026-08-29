"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PhotoCapture, { type CapturedPhoto } from "@/components/PhotoCapture";

type VehicleOption = {
  id: string;
  brand: string;
  model: string | null;
  plateNumber: string;
  seats: number | null;
  currentOdometer: number;
  available: boolean;
  usedBy: string | null;
  blockReason: string | null;
};

export default function StartTripForm({
  vehicles,
  requiredAngles,
}: {
  vehicles: VehicleOption[];
  requiredAngles: { code: string; label: string }[];
}) {
  const router = useRouter();
  const free = vehicles.filter((v) => v.available);

  const [vehicleId, setVehicleId] = useState(free.length === 1 ? free[0].id : "");
  const [odometer, setOdometer] = useState("");
  const [fuelLevel, setFuelLevel] = useState(50);
  const [purpose, setPurpose] = useState("");
  const [destination, setDestination] = useState("");
  const [passengerCount, setPassengerCount] = useState(1);
  const [passengers, setPassengers] = useState("");
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [note, setNote] = useState("");
  const [anglePhotos, setAnglePhotos] = useState<Record<string, CapturedPhoto[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = vehicles.find((v) => v.id === vehicleId) ?? null;
  const missingAngles = requiredAngles.filter((a) => (anglePhotos[a.code]?.length ?? 0) === 0);
  const odoNumber = Number(odometer);
  const odoInvalid =
    odometer === "" || !Number.isFinite(odoNumber) || odoNumber < (chosen?.currentOdometer ?? 0);

  const ready =
    Boolean(vehicleId) &&
    !odoInvalid &&
    purpose.trim().length > 0 &&
    destination.trim().length > 0 &&
    missingAngles.length === 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId,
          purpose,
          destination,
          passengerCount,
          passengers,
          note,
          expectedReturnAt: expectedReturnAt || undefined,
          odometer: odoNumber,
          fuelLevel,
          photoIds: Object.values(anglePhotos).flat().map((p) => p.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      router.replace(`/trips/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      setBusy(false);
    }
  }

  if (free.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-sm text-slate-600">ตอนนี้ไม่มีรถว่าง</p>
        <div className="mt-3 space-y-1 text-xs text-slate-500">
          {vehicles.map((v) => (
            <p key={v.id}>
              {v.brand} {v.model ?? ""} — {v.usedBy ? `ใช้อยู่โดย ${v.usedBy}` : v.blockReason ?? "ไม่พร้อมใช้"}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">1. เลือกรถ</h2>
        {vehicles.map((v) => (
          <label
            key={v.id}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
              vehicleId === v.id ? "border-blue-500 bg-blue-50" : "border-slate-200"
            } ${v.available ? "" : "cursor-not-allowed opacity-60"}`}
          >
            <input
              type="radio"
              name="vehicle"
              className="mt-1"
              value={v.id}
              disabled={!v.available}
              checked={vehicleId === v.id}
              onChange={() => {
                setVehicleId(v.id);
                setOdometer(String(v.currentOdometer || ""));
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {v.brand} {v.model ?? ""}
              </p>
              <p className="text-xs text-slate-500">
                {v.plateNumber}
                {v.seats ? ` · ${v.seats} ที่นั่ง` : ""} · {v.currentOdometer.toLocaleString("th-TH")} กม.
              </p>
              {!v.available && (
                <p className="mt-1 text-xs text-red-600">
                  {v.usedBy ? `ถูกใช้อยู่โดย ${v.usedBy}` : v.blockReason ?? "ไม่พร้อมใช้งาน"}
                </p>
              )}
            </div>
          </label>
        ))}
      </section>

      {vehicleId && (
        <>
          <section className="card space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">2. เลขไมล์และน้ำมัน</h2>
            <div>
              <label className="label" htmlFor="odo">
                เลขไมล์ตอนนี้ (กม.) *
              </label>
              <input
                id="odo"
                type="number"
                inputMode="numeric"
                className="input"
                required
                min={chosen?.currentOdometer ?? 0}
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                ครั้งล่าสุดบันทึกไว้ {(chosen?.currentOdometer ?? 0).toLocaleString("th-TH")} กม.
              </p>
              {odoInvalid && odometer !== "" && (
                <p className="mt-1 text-xs text-red-600">เลขไมล์ต้องไม่น้อยกว่าค่าที่บันทึกไว้ล่าสุด</p>
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
            <h2 className="text-sm font-semibold text-slate-700">3. ไปไหน ทำอะไร</h2>
            <div>
              <label className="label" htmlFor="destination">
                จุดหมาย *
              </label>
              <input
                id="destination"
                className="input"
                required
                maxLength={200}
                placeholder="เช่น ภูเก็ตทาวน์"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="purpose">
                วัตถุประสงค์ *
              </label>
              <input
                id="purpose"
                className="input"
                required
                maxLength={200}
                placeholder="เช่น ส่งเอกสาร / รับลูกค้า"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="expected">
                คาดว่าจะคืนรถเมื่อ
              </label>
              <input
                id="expected"
                type="datetime-local"
                className="input"
                value={expectedReturnAt}
                onChange={(e) => setExpectedReturnAt(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                ไม่บังคับ ใส่ไว้ระบบจะเตือนถ้าเลยเวลาแล้วยังไม่คืน
              </p>
            </div>
            <div>
              <label className="label" htmlFor="pax">
                จำนวนคนในรถ (รวมคนขับ)
              </label>
              <input
                id="pax"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                className="input"
                value={passengerCount}
                onChange={(e) => setPassengerCount(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label" htmlFor="passengers">
                ผู้ร่วมเดินทาง
              </label>
              <input
                id="passengers"
                className="input"
                maxLength={300}
                placeholder="ชื่อผู้ร่วมเดินทาง (ถ้ามี)"
                value={passengers}
                onChange={(e) => setPassengers(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor="note">
                หมายเหตุ
              </label>
              <textarea
                id="note"
                className="input"
                rows={2}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">
              4. ถ่ายรูปรอบคัน ({requiredAngles.length - missingAngles.length}/{requiredAngles.length})
            </h2>
            {requiredAngles.map((a) => (
              <PhotoCapture
                key={a.code}
                angle={a.code}
                label={a.label}
                required
                value={anglePhotos[a.code] ?? []}
                onChange={(photos) => setAnglePhotos((s) => ({ ...s, [a.code]: photos }))}
              />
            ))}
          </section>

          {!ready && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {missingAngles.length > 0 && (
                <p>ยังถ่ายรูปไม่ครบ: {missingAngles.map((a) => a.label).join(", ")}</p>
              )}
              {odoInvalid && <p>ตรวจสอบเลขไมล์อีกครั้ง</p>}
              {!destination.trim() && <p>ยังไม่ได้ระบุจุดหมาย</p>}
              {!purpose.trim() && <p>ยังไม่ได้ระบุวัตถุประสงค์</p>}
            </div>
          )}

          <button className="btn-primary w-full py-3" disabled={busy || !ready}>
            {busy ? "กำลังบันทึก..." : "🚗 ยืนยันเอารถออก"}
          </button>
        </>
      )}
    </form>
  );
}
