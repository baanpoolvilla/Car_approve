import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { approvalSteps, notifications } from "@/db/schema";
import { getCurrentUser, isApprover, isFleet } from "@/lib/auth";
import AppNav, { type NavItem } from "@/components/AppNav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [unread] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));

  const [pending] = isApprover(user)
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(approvalSteps)
        .where(and(eq(approvalSteps.approverId, user.id), eq(approvalSteps.status, "PENDING")))
    : [{ n: 0 }];

  const items: NavItem[] = [
    { href: "/", label: "หน้าหลัก", icon: "🏠" },
    { href: "/requests/new", label: "ขอใช้รถ", icon: "➕" },
    { href: "/requests", label: "รายการ", icon: "📋" },
  ];
  if (isApprover(user)) items.push({ href: "/approvals", label: "อนุมัติ", icon: "✅" });
  else if (isFleet(user)) items.push({ href: "/fleet", label: "ฟลีต", icon: "🚗" });
  items.push({ href: "/more", label: "เมนู", icon: "☰" });

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
            <span className="text-lg">🚗</span>
            <span className="text-sm">ระบบใช้รถบริษัท</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {pending.n > 0 && (
              <Link
                href="/approvals"
                className="chip bg-amber-100 text-amber-800"
                title="รออนุมัติ"
              >
                รออนุมัติ {pending.n}
              </Link>
            )}
            <Link href="/notifications" className="relative p-2 text-xl" aria-label="แจ้งเตือน">
              🔔
              {unread.n > 0 && (
                <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread.n > 9 ? "9+" : unread.n}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>

      <AppNav items={items} />
    </div>
  );
}
