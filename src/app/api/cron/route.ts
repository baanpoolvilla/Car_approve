import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { handleError, ok } from "@/lib/api";
import { notifyNow } from "@/lib/notify";
import { overdueTrips } from "@/lib/trips";
import { supervisorRecipients } from "@/lib/recipients";
import { fmtDateTime } from "@/lib/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Skip a reminder that was already sent for this trip. */
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

    const late = await overdueTrips();
    const supervisors = await supervisorRecipients(db);
    let overdue = 0;

    for (const t of late) {
      const link = `/trips/${t.id}`;
      if (await alreadySent("RETURN_OVERDUE", link)) continue;
      await notifyNow({
        userIds: Array.from(new Set([t.driverId, ...supervisors])),
        type: "RETURN_OVERDUE",
        title: `ยังไม่ได้คืนรถ ${t.tripNo}`,
        body: `${t.driverName} · ${t.brand} ${t.model ?? ""}
แจ้งว่าจะคืน ${fmtDateTime(t.expectedReturnAt!)}
กรุณาคืนรถและบันทึกในระบบ`,
        link,
      });
      overdue++;
    }

    return ok({ ok: true, overdue });
  } catch (err) {
    return handleError(err);
  }
}
