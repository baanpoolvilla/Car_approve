"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด");
      setDevCode(data.devCode ?? null);
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "เกิดข้อผิดพลาด");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {step === "email" ? (
        <form onSubmit={requestCode} className="space-y-3">
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
            {busy ? "กำลังส่ง..." : "ขอรหัสเข้าสู่ระบบ"}
          </button>
          <p className="text-center text-xs text-slate-400">
            ระบบจะส่งรหัส 6 หลักไปยังอีเมลของคุณ (เฉพาะผู้ที่ได้รับเชิญ)
          </p>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm text-slate-600">
            ส่งรหัสไปที่ <span className="font-medium">{email}</span> แล้ว
          </p>
          {devCode && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              โหมดทดสอบ (ยังไม่ตั้งค่าอีเมล) รหัสของคุณคือ{" "}
              <span className="font-mono font-bold">{devCode}</span>
            </div>
          )}
          <div>
            <label className="label" htmlFor="code">
              รหัสยืนยัน 6 หลัก
            </label>
            <input
              id="code"
              className="input text-center font-mono text-2xl tracking-[0.4em]"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <button className="btn-primary w-full" disabled={busy || code.length !== 6}>
            {busy ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => {
              setStep("email");
              setCode("");
              setDevCode(null);
              setError(null);
            }}
          >
            เปลี่ยนอีเมล
          </button>
        </form>
      )}
    </div>
  );
}
