"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  isRequired: boolean;
  isActive: boolean;
};

export default function ChecklistAdmin({
  items,
  allAngles,
  requiredAngles,
}: {
  items: Item[];
  allAngles: { code: string; label: string }[];
  requiredAngles: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [angles, setAngles] = useState<string[]>(requiredAngles);
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

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <section className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">มุมรูปบังคับ (ก่อนและหลังใช้รถ)</h2>
        <div className="flex flex-wrap gap-1.5">
          {allAngles.map((a) => {
            const on = angles.includes(a.code);
            return (
              <button
                key={a.code}
                onClick={() =>
                  setAngles((s) => (on ? s.filter((x) => x !== a.code) : [...s, a.code]))
                }
                className={`chip border px-2.5 py-1 ${
                  on ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-500"
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
        <button
          className="btn-primary w-full py-1.5 text-xs"
          disabled={busy || angles.length === 0}
          onClick={() => send("/api/admin/checklist", "PUT", { angles })}
        >
          บันทึกมุมรูปบังคับ
        </button>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">รายการตรวจสภาพรถ</h2>
          <button className="text-xs text-blue-700" onClick={() => setAdding((s) => !s)}>
            {adding ? "ปิด" : "+ เพิ่มรายการ"}
          </button>
        </div>

        {adding && (
          <form
            className="card space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const done = await send("/api/admin/checklist", "POST", {
                code: fd.get("code"),
                name: fd.get("name"),
                category: fd.get("category"),
                isRequired: true,
              });
              if (done) setAdding(false);
            }}
          >
            <input name="code" className="input" required placeholder="รหัส เช่น BRAKE_FLUID" />
            <input name="name" className="input" required placeholder="ชื่อรายการ" />
            <input name="category" className="input" placeholder="หมวด เช่น ภายนอก" />
            <button className="btn-primary w-full py-1.5 text-xs" disabled={busy}>
              เพิ่มรายการ
            </button>
          </form>
        )}

        {items.map((it) => (
          <div key={it.id} className={`card py-3 ${it.isActive ? "" : "opacity-50"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{it.name}</p>
                <p className="text-xs text-slate-400">
                  {it.code}
                  {it.category ? ` · ${it.category}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  className={`chip border px-2 py-1 ${
                    it.isRequired
                      ? "border-blue-700 bg-blue-700 text-white"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                  disabled={busy}
                  onClick={() =>
                    send(`/api/admin/checklist/${it.id}`, "PATCH", { isRequired: !it.isRequired })
                  }
                >
                  บังคับ
                </button>
                <button
                  className={`chip border px-2 py-1 ${
                    it.isActive
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                  disabled={busy}
                  onClick={() =>
                    send(`/api/admin/checklist/${it.id}`, "PATCH", { isActive: !it.isActive })
                  }
                >
                  ใช้งาน
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
