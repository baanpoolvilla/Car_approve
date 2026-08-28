import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, userRoles, users, vehicleRequests, vehicles } from "@/db/schema";
import { handleError, ok } from "@/lib/api";
import { notifyNow } from "@/lib/notify";
import { expireStaleRequests } from "@/lib/workflow";
import { fmtDateTime } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Skip a reminder that was already sent for this request. */
async function alreadySent(type: string, link: string) {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.type, type), eq(notifications.link, link)));
  return (rows[0]?.n ?? 0) > 0;
}

export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization");
    if (secret && auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const now = new Date();
    const soon = new Date(now.getTime() + 60 * 60_000);
    let reminders = 0;
    let overdue = 0;

    // Trips starting within the next hour.
    const upcoming = await db
      .select({ r: vehicleRequests, v: vehicles })
      .from(vehicleRequests)
      .leftJoin(vehicles, eq(vehicles.id, vehicleRequests.vehicleId))
      .where(
        and(
          eq(vehicleRequests.status, "APPROVED"),
          gt(vehicleRequests.plannedStartAt, now),
          lt(vehicleRequests.plannedStartAt, soon)
        )
      );

    for (const { r, v } of upcoming) {
      const link = `/requests/${r.id}`;
      if (await alreadySent("TRIP_REMINDER", link)) continue;
      await notifyNow({
        userIds: [r.requesterId],
        type: "TRIP_REMINDER",
        title: `ใกล้ถึงเวลาใช้รถ ${r.requestNo}`,
        body: `${v?.brand ?? ""} ${v?.model ?? ""} เริ่ม ${fmtDateTime(r.plannedStartAt)}\nอย่าลืมตรวจสภาพรถและถ่ายรูปก่อนนำรถออก`,
        link,
      });
      reminders++;
    }

    // Vehicles not returned on time.
    const late = await db
      .select({ r: vehicleRequests })
      .from(vehicleRequests)
      .where(
        and(eq(vehicleRequests.status, "CHECKED_OUT"), lt(vehicleRequests.plannedEndAt, now))
      );

    const fleet = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .where(and(eq(userRoles.role, "FLEET_MANAGER"), eq(users.isActive, true)));

    for (const { r } of late) {
      const link = `/requests/${r.id}`;
      if (await alreadySent("RETURN_OVERDUE", link)) continue;
      await notifyNow({
        userIds: Array.from(new Set([r.requesterId, ...fleet.map((f) => f.id)])),
        type: "RETURN_OVERDUE",
        title: `เลยกำหนดคืนรถ ${r.requestNo}`,
        body: `กำหนดคืน ${fmtDateTime(r.plannedEndAt)} กรุณาคืนรถและบันทึกการตรวจสภาพในระบบ`,
        link,
      });
      overdue++;
    }

    const expired = await expireStaleRequests();

    return ok({ ok: true, reminders, overdue, expired });
  } catch (err) {
    return handleError(err);
  }
}
