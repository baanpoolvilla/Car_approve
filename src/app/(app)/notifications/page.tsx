import Link from "next/link";
import { desc, eq, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUserPage } from "@/lib/auth";
import { fmtDateTime } from "@/lib/datetime";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUserPage();

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, user.id))
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  // Opening the centre marks everything as read.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

  return (
    <div>
      <PageHeader title="การแจ้งเตือน" />
      {rows.length === 0 ? (
        <EmptyState text="ยังไม่มีการแจ้งเตือน" />
      ) : (
        <div className="space-y-2">
          {rows.map((n) => {
            const inner = (
              <div className={`card ${n.readAt ? "" : "border-blue-300 bg-blue-50/40"}`}>
                <p className="text-sm font-medium text-slate-900">{n.title}</p>
                {n.body && <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{n.body}</p>}
                <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} className="block">
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
