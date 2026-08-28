"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TermsAdmin({
  current,
  versions,
}: {
  current: string;
  versions: { id: string; version: string; isActive: boolean; effectiveAt: string }[];
}) {
  const router = useRouter();
  const [version, setVersion] = useState("");
  const [content, setContent] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <form
        className="card space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/admin/terms", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ version, content }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
            setVersion("");
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="text-sm font-semibold text-slate-700">เผยแพร่เวอร์ชันใหม่</h2>
        <input
          className="input"
          required
          placeholder="เลขเวอร์ชัน เช่น 1.1"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        />
        <textarea
          className="input font-mono text-xs leading-6"
          rows={14}
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button className="btn-primary w-full" disabled={busy}>
          เผยแพร่และตั้งเป็นฉบับปัจจุบัน
        </button>
      </form>

      <section className="card">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">ประวัติเวอร์ชัน</h2>
        <ul className="space-y-1 text-sm">
          {versions.map((v) => (
            <li key={v.id} className="flex justify-between">
              <span className="text-slate-700">ฉบับ {v.version}</span>
              <span className="text-xs text-slate-400">
                {v.effectiveAt}
                {v.isActive ? " · ใช้งานอยู่" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
