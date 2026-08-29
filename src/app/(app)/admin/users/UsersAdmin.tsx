"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RoleCode } from "@/db/schema";

type Row = {
  id: string;
  email: string;
  name: string;
  department: string | null;
  isActive: boolean;
  hasPin: boolean;
  roles: RoleCode[];
};

const ASSIGNABLE: { code: RoleCode; label: string }[] = [
  { code: "APPROVER", label: "ผู้รับแจ้งเตือน" },
  { code: "FLEET_MANAGER", label: "ผู้ดูแลรถ" },
  { code: "ADMIN", label: "ผู้ดูแลระบบ" },
  { code: "AUDITOR", label: "ผู้ตรวจสอบ" },
];

export default function UsersAdmin({ users }: { users: Row[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    const okDone = await send("/api/admin/users", "POST", { email, name, department });
    if (okDone) {
      setEmail("");
      setName("");
      setDepartment("");
      setAdding(false);
    }
  }

  function toggleRole(u: Row, role: RoleCode) {
    const next = u.roles.includes(role)
      ? u.roles.filter((r) => r !== role)
      : [...u.roles, role];
    send(`/api/admin/users/${u.id}`, "PATCH", { roles: next });
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {adding ? (
        <form onSubmit={addUser} className="card space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">เชิญผู้ใช้ใหม่</h2>
          <input
            className="input"
            type="email"
            required
            placeholder="อีเมล"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            required
            placeholder="ชื่อ"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            placeholder="แผนก (ไม่บังคับ)"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy}>
              เพิ่มผู้ใช้
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => setAdding(false)}
              disabled={busy}
            >
              ยกเลิก
            </button>
          </div>
        </form>
      ) : (
        <button className="btn-primary w-full" onClick={() => setAdding(true)}>
          ➕ เชิญผู้ใช้
        </button>
      )}

      {users.map((u) => (
        <div key={u.id} className={`card ${u.isActive ? "" : "opacity-60"}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{u.name}</p>
              <p className="truncate text-xs text-slate-500">{u.email}</p>
              {u.department && <p className="text-xs text-slate-400">{u.department}</p>}
            </div>
            <button
              className={`chip ${u.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}
              disabled={busy}
              onClick={() => send(`/api/admin/users/${u.id}`, "PATCH", { isActive: !u.isActive })}
            >
              {u.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={u.hasPin ? "text-emerald-700" : "text-slate-400"}>
              {u.hasPin ? "🔒 ตั้งรหัสแล้ว" : "ยังไม่ได้ตั้งรหัส"}
            </span>
            {u.hasPin && (
              <button
                className="text-blue-700 underline"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      `รีเซ็ตรหัสของ ${u.name}?
${u.name} จะถูกออกจากระบบทุกอุปกรณ์ และตั้งรหัสใหม่เองได้ในการเข้าใช้งานครั้งถัดไป`
                    )
                  ) {
                    send(`/api/admin/users/${u.id}/reset-pin`, "POST", {});
                  }
                }}
              >
                รีเซ็ตรหัส
              </button>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ASSIGNABLE.map((r) => {
              const on = u.roles.includes(r.code);
              return (
                <button
                  key={r.code}
                  disabled={busy}
                  onClick={() => toggleRole(u, r.code)}
                  className={`chip border px-2.5 py-1 ${
                    on
                      ? "border-blue-700 bg-blue-700 text-white"
                      : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
