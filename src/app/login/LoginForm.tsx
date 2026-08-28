"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "email" | "enter-pin" | "set-pin";

function PinInput({
  id,
  label,
  value,
  onChange,
  autoFocus = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input text-center font-mono text-2xl tracking-[0.4em]"
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        autoComplete="off"
        required
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
    </div>
  );
}

export default function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, payload: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด");
    return data;
  }

  function reset() {
    setStep("email");
    setPin("");
    setConfirmPin("");
    setError(null);
  }

  async function checkEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await post("/api/auth/check", { email });
      setName(data.name);
      setStep(data.hasPin ? "enter-pin" : "set-pin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function submitPin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (step === "set-pin") {
        await post("/api/auth/set-pin", { email, pin, confirmPin });
      } else {
        await post("/api/auth/login", { email, pin });
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setPin("");
      setConfirmPin("");
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {step === "email" && (
        <form onSubmit={checkEmail} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">
              อีเมล
            </label>
            <input
              id="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="name@baanpoolvilla.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "กำลังตรวจสอบ..." : "ยืนยัน"}
          </button>
          <p className="text-center text-xs text-slate-400">
            ใช้ได้เฉพาะอีเมลที่ผู้ดูแลระบบเพิ่มไว้แล้ว
          </p>
        </form>
      )}

      {step === "set-pin" && (
        <form onSubmit={submitPin} className="space-y-3">
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            สวัสดี {name} — เข้าใช้งานครั้งแรก กรุณาตั้งรหัส 6 หลักของคุณเอง
            <br />
            <span className="text-xs">ครั้งต่อไปใช้รหัสนี้เข้าระบบได้เลย</span>
          </div>
          <PinInput id="pin" label="ตั้งรหัส 6 หลัก" value={pin} onChange={setPin} autoFocus />
          <PinInput
            id="confirm"
            label="ยืนยันรหัสอีกครั้ง"
            value={confirmPin}
            onChange={setConfirmPin}
          />
          <button
            className="btn-primary w-full"
            disabled={busy || pin.length !== 6 || confirmPin.length !== 6}
          >
            {busy ? "กำลังบันทึก..." : "ตั้งรหัสและเข้าสู่ระบบ"}
          </button>
          <button type="button" className="btn-secondary w-full" onClick={reset}>
            เปลี่ยนอีเมล
          </button>
        </form>
      )}

      {step === "enter-pin" && (
        <form onSubmit={submitPin} className="space-y-3">
          <p className="text-sm text-slate-600">
            สวัสดี <span className="font-medium">{name}</span>
          </p>
          <PinInput id="pin" label="รหัส 6 หลัก" value={pin} onChange={setPin} autoFocus />
          <button className="btn-primary w-full" disabled={busy || pin.length !== 6}>
            {busy ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
          <button type="button" className="btn-secondary w-full" onClick={reset}>
            เปลี่ยนอีเมล
          </button>
          <p className="text-center text-xs text-slate-400">
            ลืมรหัส? ติดต่อผู้ดูแลระบบเพื่อรีเซ็ต แล้วตั้งรหัสใหม่ได้ทันที
          </p>
        </form>
      )}
    </div>
  );
}
