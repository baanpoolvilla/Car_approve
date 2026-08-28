import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import { requireRolePage } from "@/lib/auth";
import { fmtDateTime } from "@/lib/datetime";
import { BackLink, EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  await requireRolePage("AUDITOR");
  const rows = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(200);

  return (
    <div>
      <BackLink href="/more" label="เมนู" />
      <PageHeader title="Audit Log" subtitle="บันทึกแบบเพิ่มอย่างเดียว แก้ไขย้อนหลังไม่ได้" />
      {rows.length === 0 ? (
        <EmptyState text="ยังไม่มีบันทึก" />
      ) : (
        <div className="space-y-2">
          {rows.map((e) => (
            <div key={e.id} className="card py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {e.action} · {e.entityType}
                  </p>
                  <p className="truncate text-xs text-slate-500">{e.actorEmail ?? "ระบบ"}</p>
                  {e.entityId && <p className="truncate text-[11px] text-slate-400">{e.entityId}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">{fmtDateTime(e.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
