"use client";

import { useRef, useState } from "react";
import { compressImage } from "@/lib/image";

export type CapturedPhoto = { id: string; url: string; angle: string };

export default function PhotoCapture({
  tripId,
  angle,
  label,
  required = false,
  multiple = false,
  value,
  onChange,
}: {
  /** Omitted while taking a car out — the trip row does not exist yet. */
  tripId?: string | null;
  angle: string;
  label: string;
  required?: boolean;
  multiple?: boolean;
  value: CapturedPhoto[];
  onChange: (photos: CapturedPhoto[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(fileList: FileList | null) {
    if (!fileList?.length) return;
    setBusy(true);
    setError(null);
    try {
      const next: CapturedPhoto[] = multiple ? [...value] : [];
      for (const raw of Array.from(fileList)) {
        const file = await compressImage(raw);
        const form = new FormData();
        form.append("file", file);
        if (tripId) form.append("tripId", tripId);
        form.append("angle", angle);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "อัปโหลดไม่สำเร็จ");
        next.push({ id: data.id, url: data.url, angle });
      }
      onChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string) {
    await fetch(`/api/photos/${id}`, { method: "DELETE" });
    onChange(value.filter((p) => p.id !== id));
  }

  const done = value.length > 0;

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </span>
        {done && <span className="chip bg-emerald-100 text-emerald-800">ถ่ายแล้ว</span>}
      </div>

      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((p) => (
            <div key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={label}
                className="h-24 w-24 rounded-lg border border-slate-200 object-cover"
              />
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs text-white"
                aria-label="ลบรูป"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={multiple}
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <button
        type="button"
        className="btn-secondary w-full"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "กำลังอัปโหลด..." : done && !multiple ? "📷 ถ่ายใหม่" : "📷 ถ่ายรูป"}
      </button>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
