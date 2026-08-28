"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type VehicleOption = {
  id: string;
  brand: string;
  model: string | null;
  plateNumber: string;
  seats: number | null;
  available: boolean;
  hardConflicts: { requestNo: string; requester: string; start: string; end: string }[];
  pendingConflicts: number;
  blocks: { reason: string }[];
};

function nowLocal(offsetHours = 1) {
  const d = new Date(Date.now() + offsetHours * 3600_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:00`;
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));

export default function NewRequestForm({
  termsVersion,
  termsContent,
}: {
  termsVersion: string | null;
  termsContent: string | null;
}) {
  const router = useRouter();
  const [start, setStart] = useState(() => nowLocal(1));
  const [end, setEnd] = useState(() => nowLocal(4));
  const [vehicles, setVehicles] = useState<VehicleOption[] | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [destination, setDestination] = useState("");
  const [passengerCount, setPassengerCount] = useState(1);
  const [passengers, setPassengers] = useState("");
  const [note, setNote] = useState("");
  const [accept, setAccept] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toIso = (local: string) => new Date(`${local}:00+07:00`).toISOString();

  async function checkAvailability() {
    setError(null);
    setVehicles(null);
    setVehicleId("");
    if (new Date(`${end}:00+07:00`) <= new Date(`${start}:00+07:00`)) {
      setError("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
      return;
    }
    setBusy(true);
    try {
      const qs = `from=${encodeURIComponent(toIso(start))}&to=${encodeURIComponent(toIso(end))}`;
      const res = await fetch(`/api/vehicles/availability?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ตรวจสอบไม่สำเร็จ");
      setVehicles(data.vehicles);
      const firstFree = data.vehicles.find((v: VehicleOption) => v.available);
      if (firstFree) setVehicleId(firstFree.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ตรวจสอบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId,
          start,
          end,
          purpose,
          destination,
          passengerCount,
          passengers,
          note,
          acceptTerms: accept,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ส่งคำขอไม่สำเร็จ");
      router.replace(`/requests/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งคำขอไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">1. ช่วงเวลาที่ใช้รถ</h2>
        <div>
          <label className="label" htmlFor="start">
            เริ่ม
          </label>
          <input
            id="start"
            type="datetime-local"
            className="input"
            required
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setVehicles(null);
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor="end">
            สิ้นสุด
          </label>
          <input
            id="end"
            type="datetime-local"
            className="input"
            required
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setVehicles(null);
            }}
          />
        </div>
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={checkAvailability}
          disabled={busy}
        >
          {busy ? "กำลังตรวจสอบ..." : "🔍 ตรวจรถที่ว่าง"}
        </button>
      </section>

      {vehicles && (
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">2. เลือกรถ</h2>
          {vehicles.map((v) => (
            <label
              key={v.id}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${
                vehicleId === v.id ? "border-blue-500 bg-blue-50" : "border-slate-200"
              } ${v.available ? "" : "opacity-60"}`}
            >
              <input
                type="radio"
                name="vehicle"
                className="mt-1"
                value={v.id}
                disabled={!v.available}
                checked={vehicleId === v.id}
                onChange={() => setVehicleId(v.id)}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {v.brand} {v.model ?? ""}
                </p>
                <p className="text-xs text-slate-500">
                  {v.plateNumber}
                  {v.seats ? ` · ${v.seats} ที่นั่ง` : ""}
                </p>
                {v.available ? (
                  <p className="mt-1 text-xs font-medium text-emerald-700">ว่าง</p>
                ) : (
                  <div className="mt-1 space-y-0.5 text-xs text-red-600">
                    {v.hardConflicts.map((c) => (
                      <p key={c.requestNo}>
                        ถูกจองแล้ว {c.requestNo} ({c.requester}) {fmt(c.start)}–{fmt(c.end)}
                      </p>
                    ))}
                    {v.blocks.map((b, i) => (
                      <p key={i}>ปิดใช้งาน: {b.reason}</p>
                    ))}
                  </div>
                )}
                {v.available && v.pendingConflicts > 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    ⚠️ มีคำขออื่นรออนุมัติช่วงเวลานี้ {v.pendingConflicts} รายการ
                  </p>
                )}
              </div>
            </label>
          ))}
          {vehicles.every((v) => !v.available) && (
            <p className="text-sm text-red-600">ไม่มีรถว่างในช่วงเวลานี้ กรุณาเลือกเวลาอื่น</p>
          )}
        </section>
      )}

      {vehicleId && (
        <>
          <section className="card space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">3. รายละเอียดการเดินทาง</h2>
            <div>
              <label className="label" htmlFor="purpose">
                วัตถุประสงค์ *
              </label>
              <input
                id="purpose"
                className="input"
                required
                maxLength={200}
                placeholder="เช่น ไปพบลูกค้า / ส่งเอกสาร"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </div>
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
              <label className="label" htmlFor="pax">
                จำนวนผู้โดยสาร (รวมผู้ขับ) *
              </label>
              <input
                id="pax"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                className="input"
                required
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
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </section>

          <section className="card space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">4. เงื่อนไขการใช้รถ</h2>
            {termsContent && (
              <>
                <button
                  type="button"
                  className="text-xs text-blue-700 underline"
                  onClick={() => setShowTerms((s) => !s)}
                >
                  {showTerms ? "ซ่อนเงื่อนไข" : `อ่านเงื่อนไข (ฉบับ ${termsVersion})`}
                </button>
                {showTerms && (
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs leading-6 text-slate-700">
                    {termsContent}
                  </pre>
                )}
              </>
            )}
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={accept}
                onChange={(e) => setAccept(e.target.checked)}
              />
              <span>
                ข้าพเจ้ายอมรับเงื่อนไขการใช้รถบริษัท
                {termsVersion ? ` (ฉบับ ${termsVersion})` : ""}
              </span>
            </label>
          </section>

          <button className="btn-primary w-full py-3" disabled={busy || !accept}>
            {busy ? "กำลังส่ง..." : "ส่งคำขออนุมัติ"}
          </button>
        </>
      )}
    </form>
  );
}
