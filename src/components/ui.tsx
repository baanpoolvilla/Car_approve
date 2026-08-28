import Link from "next/link";
import type { RequestStatus } from "@/db/schema";
import { STATUS_LABEL_MAP } from "@/lib/labels";

export const STATUS_LABEL = STATUS_LABEL_MAP;

const STATUS_CLASS: Record<RequestStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-red-100 text-red-800",
  CHECKED_OUT: "bg-indigo-100 text-indigo-800",
  RETURNED: "bg-orange-100 text-orange-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-slate-200 text-slate-600",
  EXPIRED: "bg-slate-200 text-slate-600",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`chip ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

export const VEHICLE_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "พร้อมใช้งาน",
  IN_USE: "กำลังใช้งาน",
  MAINTENANCE: "ซ่อมบำรุง",
  INACTIVE: "ปิดใช้งาน",
};

export function VehicleBadge({ status }: { status: string }) {
  const cls =
    status === "AVAILABLE"
      ? "bg-emerald-100 text-emerald-800"
      : status === "IN_USE"
        ? "bg-indigo-100 text-indigo-800"
        : "bg-slate-200 text-slate-600";
  return <span className={`chip ${cls}`}>{VEHICLE_STATUS_LABEL[status] ?? status}</span>;
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ text, cta }: { text: string; cta?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
      <p className="text-sm text-slate-500">{text}</p>
      {cta && <div className="mt-3">{cta}</div>}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <span className="shrink-0 text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-3 inline-flex items-center gap-1 text-sm text-blue-700">
      ← {label}
    </Link>
  );
}
