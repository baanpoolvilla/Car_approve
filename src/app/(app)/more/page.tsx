import Link from "next/link";
import { requireUserPage, isAdmin, isFleet, isAuditor } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import ChangePinForm from "@/components/ChangePinForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  EMPLOYEE: "พนักงาน",
  APPROVER: "ผู้รับแจ้งเตือน",
  FLEET_MANAGER: "ผู้ดูแลรถ",
  ADMIN: "ผู้ดูแลระบบ",
  AUDITOR: "ผู้ตรวจสอบ",
};

function MenuLink({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50"
    >
      <span className="text-lg">{icon}</span>
      <span className="flex-1 text-sm text-slate-800">{label}</span>
      <span className="text-slate-300">›</span>
    </Link>
  );
}

export default async function MorePage() {
  const user = await requireUserPage();

  return (
    <div className="space-y-4">
      <PageHeader title="เมนู" />

      <div className="card">
        <p className="text-base font-semibold text-slate-900">{user.name}</p>
        <p className="text-sm text-slate-500">{user.email}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {user.roles.map((r) => (
            <span key={r} className="chip bg-slate-100 text-slate-600">
              {ROLE_LABEL[r] ?? r}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <MenuLink href="/trips" icon="📋" label="ประวัติการใช้รถ" />
        <MenuLink href="/notifications" icon="🔔" label="การแจ้งเตือน" />
        <MenuLink href="/terms" icon="📄" label="เงื่อนไขการใช้รถ" />
      </div>

      {isFleet(user) && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
            ผู้ดูแลรถ
          </p>
          <MenuLink href="/fleet" icon="📊" label="Fleet Dashboard" />
          <MenuLink href="/reports" icon="📈" label="รายงานและ Export" />
        </div>
      )}

      {isAdmin(user) && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <p className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">
            ผู้ดูแลระบบ
          </p>
          <MenuLink href="/admin/users" icon="👥" label="ผู้ใช้และสิทธิ์" />
          <MenuLink href="/admin/vehicles" icon="🚙" label="ข้อมูลรถ" />
        </div>
      )}

      {isAuditor(user) && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <MenuLink href="/admin/audit" icon="🧾" label="Audit Log" />
        </div>
      )}

      <ChangePinForm />
      <LogoutButton />
      <p className="pb-2 text-center text-xs text-slate-400">
        ระบบบันทึกการใช้รถบริษัท · เขตเวลา Asia/Bangkok
      </p>
    </div>
  );
}
