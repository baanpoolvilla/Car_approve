import { and, eq, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { incidents, photos, userRoles, users, vehicleRequests } from "@/db/schema";
import { body, fail, ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { clientIp } from "@/lib/audit";
import { logAudit } from "@/lib/audit";
import { queueNotification } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  severity: "MINOR" | "MODERATE" | "MAJOR";
  occurredAt: string;
  location?: string;
  description: string;
  thirdParty?: string;
  policeReportNo?: string;
  insuranceClaimNo?: string;
  photoIds?: string[];
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const p = await body<Payload>(req);

    const request = await db.query.vehicleRequests.findFirst({
      where: eq(vehicleRequests.id, id),
    });
    if (!request) return fail("ไม่พบคำขอ", 404);

    const canReport =
      request.requesterId === user.id ||
      user.roles.includes("FLEET_MANAGER") ||
      user.roles.includes("ADMIN");
    if (!canReport) return fail("คุณไม่มีสิทธิ์รายงานเหตุของคำขอนี้", 403);
    if (!p.description?.trim()) return fail("กรุณาระบุรายละเอียดเหตุการณ์");
    if (!p.occurredAt) return fail("กรุณาระบุวันเวลาที่เกิดเหตุ");

    const occurredAt = new Date(`${p.occurredAt}:00+07:00`);
    if (Number.isNaN(occurredAt.getTime())) return fail("วันเวลาไม่ถูกต้อง");

    const ip = await clientIp();
    let deliver: () => Promise<void> = async () => {};

    const incidentId = await db.transaction(async (tx: Tx) => {
      const [inc] = await tx
        .insert(incidents)
        .values({
          requestId: id,
          severity: p.severity ?? "MINOR",
          occurredAt,
          location: p.location?.trim() || null,
          description: p.description.trim(),
          thirdParty: p.thirdParty?.trim() || null,
          policeReportNo: p.policeReportNo?.trim() || null,
          insuranceClaimNo: p.insuranceClaimNo?.trim() || null,
          reportedBy: user.id,
        })
        .returning({ id: incidents.id });

      if (p.photoIds?.length) {
        await tx
          .update(photos)
          .set({ incidentId: inc.id })
          .where(and(inArray(photos.id, p.photoIds), eq(photos.requestId, id)));
      }

      await tx
        .update(vehicleRequests)
        .set({ hasNewDamage: true, updatedAt: new Date() })
        .where(eq(vehicleRequests.id, id));

      await logAudit(tx, {
        actor: user,
        entityType: "vehicle_request",
        entityId: id,
        action: "INCIDENT",
        after: { incidentId: inc.id, severity: p.severity, description: p.description },
        ip,
      });

      const fleet = await tx
        .select({ id: users.id })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(and(eq(userRoles.role, "FLEET_MANAGER"), eq(users.isActive, true)));

      deliver = await queueNotification(tx, {
        userIds: fleet.map((f) => f.id),
        type: "INCIDENT_REPORTED",
        title: `แจ้งอุบัติเหตุ ${request.requestNo}`,
        body: `${user.name}: ${p.description.trim()}`,
        link: `/requests/${id}`,
      });

      return inc.id;
    });

    await deliver();
    return ok({ id: incidentId }, 201);
  })(req);
}
