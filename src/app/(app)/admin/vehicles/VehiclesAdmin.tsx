"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Vehicle = {
  id: string;
  plateNumber: string;
  brand: string;
  model: string | null;
  year: number | null;
  color: string | null;
  seats: number | null;
  currentOdometer: number;
  status: string;
  note: string | null;
  isActive: boolean;
};

type Block = {
  id: string;
  vehicleId: string;
  reason: string;
  startAt: string;
  endAt: string;
};

const STATUSES = [
  ["AVAILABLE", "พร้อมใช้งาน"],
  ["MAINTENANCE", "ซ่อมบำรุง"],
  ["INACTIVE", "ปิดใช้งาน"],
] as const;

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));

function localNow(offsetHours = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(Date.now() + offsetHours * 3600_000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:00`;
}

export default function VehiclesAdmin({
  vehicles,
  blocks,
}: {
  vehicles: Vehicle[];
  blocks: Block[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function send(url: string, method: string, payload: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "ดำเนินการไม่สำเร็จ");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "ดำเนินการไม่สำเร็จ");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function formPayload(form: HTMLFormElement) {
    const fd = new FormData(form);
    const num = (k: string) => {
      const v = String(fd.get(k) ?? "").trim();
      return v === "" ? null : Number(v);
    };
    return {
      plateNumber: String(fd.get("plateNumber") ?? "").trim(),
      brand: String(fd.get("brand") ?? "").trim(),
      model: String(fd.get("model") ?? "").trim(),
      year: num("year"),
      color: String(fd.get("color") ?? "").trim(),
      seats: num("seats"),
      currentOdometer: num("currentOdometer") ?? 0,
      note: String(fd.get("note") ?? "").trim(),
    };
  }

  const fields = (v?: Vehicle) => (
    <>
      <div className="grid grid-cols-2 gap-2">
        <input name="plateNumber" className="input" required placeholder="ทะเบียน *" defaultValue={v?.plateNumber ?? ""} />
        <input name="brand" className="input" required placeholder="ยี่ห้อ *" defaultValue={v?.brand ?? ""} />
        <input name="model" className="input" placeholder="รุ่น" defaultValue={v?.model ?? ""} />
        <input name="year" className="input" inputMode="numeric" placeholder="ปี" defaultValue={v?.year ?? ""} />
        <input name="color" className="input" placeholder="สี" defaultValue={v?.color ?? ""} />
        <input name="seats" className="input" inputMode="numeric" placeholder="ที่นั่ง" defaultValue={v?.seats ?? ""} />
      </div>
      <input
        name="currentOdometer"
        className="input"
        inputMode="numeric"
        placeholder="เลขไมล์ปัจจุบัน"
        defaultValue={v?.currentOdometer ?? 0}
      />
      <input name="note" className="input" placeholder="หมายเหตุ" defaultValue={v?.note ?? ""} />
    </>
  );

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {adding ? (
        <form
          className="card space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const done = await send("/api/admin/vehicles", "POST", formPayload(e.currentTarget));
            if (done) setAdding(false);
          }}
        >
          <h2 className="text-sm font-semibold text-slate-700">เพิ่มรถ</h2>
          {fields()}
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy}>บันทึก</button>
            <button type="button" className="btn-secondary flex-1" onClick={() => setAdding(false)}>
              ยกเลิก
            </button>
          </div>
        </form>
      ) : (
        <button className="btn-primary w-full" onClick={() => setAdding(true)}>
          ➕ เพิ่มรถ
        </button>
      )}

      {vehicles.map((v) => {
        const myBlocks = blocks.filter((b) => b.vehicleId === v.id);
        return (
          <div key={v.id} className={`card space-y-2 ${v.isActive ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {v.brand} {v.model ?? ""}
                </p>
                <p className="text-xs text-slate-500">
                  {v.plateNumber} · {v.currentOdometer.toLocaleString("th-TH")} กม.
                  {v.seats ? ` · ${v.seats} ที่นั่ง` : ""}
                </p>
                {v.note && <p className="mt-0.5 text-xs text-slate-400">{v.note}</p>}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map(([code, label]) => (
                <button
                  key={code}
                  disabled={busy || v.status === "IN_USE"}
                  onClick={() => send(`/api/admin/vehicles/${v.id}`, "PATCH", { status: code })}
                  className={`chip border px-2.5 py-1 ${
                    v.status === code
                      ? "border-blue-700 bg-blue-700 text-white"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  {label}
                </button>
              ))}
              {v.status === "IN_USE" && (
                <span className="chip bg-indigo-100 text-indigo-800">กำลังใช้งาน</span>
              )}
            </div>

            {myBlocks.length > 0 && (
              <ul className="space-y-0.5 text-xs text-slate-500">
                {myBlocks.map((b) => (
                  <li key={b.id}>
                    🔒 {fmt(b.startAt)} – {fmt(b.endAt)} · {b.reason}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <button
                className="btn-secondary flex-1 py-1.5 text-xs"
                onClick={() => setEditing(editing === v.id ? null : v.id)}
              >
                แก้ไขข้อมูล
              </button>
              <button
                className="btn-secondary flex-1 py-1.5 text-xs"
                onClick={() => setBlocking(blocking === v.id ? null : v.id)}
              >
                ปิดรถชั่วคราว
              </button>
            </div>

            {editing === v.id && (
              <form
                className="space-y-2 border-t border-slate-100 pt-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const done = await send(
                    `/api/admin/vehicles/${v.id}`,
                    "PATCH",
                    formPayload(e.currentTarget)
                  );
                  if (done) setEditing(null);
                }}
              >
                {fields(v)}
                <button className="btn-primary w-full py-1.5 text-xs" disabled={busy}>
                  บันทึกการแก้ไข
                </button>
              </form>
            )}

            {blocking === v.id && (
              <form
                className="space-y-2 border-t border-slate-100 pt-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const done = await send(`/api/admin/vehicles/${v.id}/unavailability`, "POST", {
                    start: fd.get("start"),
                    end: fd.get("end"),
                    reason: fd.get("reason"),
                  });
                  if (done) setBlocking(null);
                }}
              >
                <input name="start" type="datetime-local" className="input" required defaultValue={localNow()} />
                <input name="end" type="datetime-local" className="input" required defaultValue={localNow(24)} />
                <input name="reason" className="input" required placeholder="เหตุผล เช่น เข้าศูนย์บริการ" />
                <button className="btn-primary w-full py-1.5 text-xs" disabled={busy}>
                  บันทึกช่วงปิดใช้งาน
                </button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
