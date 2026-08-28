"use client";

import { useState } from "react";

export default function ChangePinForm() {
  const [open, setOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void
  ) => (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input text-center font-mono text-xl tracking-[0.3em]"
        type="password"
        inputMode="numeric"
        maxLength={6}
        autoComplete="off"
        required
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
    </div>
  );

  if (!open) {
    return (
      <button className="btn-secondary w-full" onClick={() => setOpen(true)}>
        🔒 เปลี่ยนรหัส 6 หลัก
      </button>
    );
  }

  return (
    <form
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/auth/change-pin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentPin, newPin, confirmPin }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "เปลี่ยนรหัสไม่สำเร็จ");
          setDone(true);
          setOpen(false);
          setCurrentPin("");
          setNewPin("");
          setConfirmPin("");
        } catch (err) {
          setError(err instanceof Error ? err.message : "เปลี่ยนรหัสไม่สำเร็จ");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-sm font-semibold text-slate-700">เปลี่ยนรหัส 6 หลัก</h2>
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {done && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          เปลี่ยนรหัสเรียบร้อย
        </div>
      )}
      {field("cur", "รหัสเดิม", currentPin, setCurrentPin)}
      {field("new", "รหัสใหม่", newPin, setNewPin)}
      {field("cfm", "ยืนยันรหัสใหม่", confirmPin, setConfirmPin)}
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1"
          disabled={busy || newPin.length !== 6 || confirmPin.length !== 6 || currentPin.length !== 6}
        >
          {busy ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        <button type="button" className="btn-secondary flex-1" onClick={() => setOpen(false)}>
          ยกเลิก
        </button>
      </div>
    </form>
  );
}
