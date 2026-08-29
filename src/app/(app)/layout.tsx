import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getCurrentUser, isFleet } from "@/lib/auth";
import { findOpenTrip } from "@/lib/trips";
import AppNav, { type NavItem } from "@/components/AppNav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [[unread], openTrip] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
    findOpenTrip(user.id),
  ]);

  const items: NavItem[] = [
    { href: "/", label: "หน้าหลัก", icon: "🏠" },
    openTrip
      ? { href: `/trips/${openTrip.id}/return`, label: "คืนรถ", icon: "🏁" }
      : { href: "/trips/new", label: "เอารถออก", icon: "🚗" },
    { href: "/trips", label: "ประวัติ", icon: "📋" },
  ];
  if (isFleet(user)) items.push({ href: "/fleet", label: "ฟลีต", icon: "📊" });
  items.push({ href: "/more", label: "เมนู", icon: "☰" });

  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
            <span className="text-lg">🚗</span>
            <span className="text-sm">บันทึกการใช้รถ</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {openTrip && (
              <Link href={`/trips/${openTrip.id}`} className="chip bg-indigo-100 text-indigo-800">
                ถือรถอยู่
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
