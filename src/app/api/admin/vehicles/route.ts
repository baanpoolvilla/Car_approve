import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vehicles } from "@/db/schema";
import { body, fail, ok, route } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Payload = {
  plateNumber: string;
  brand: string;
  model?: string;
  year?: number;
  color?: string;
  seats?: number;
  currentOdometer?: number;
  note?: string;
};

export const POST = route(async (req) => {
  const admin = await requireRole("FLEET_MANAGER");
  const p = await body<Payload>(req);

  const plate = p.plateNumber?.trim();
  if (!plate) return fail("กรุณาระบุเลขทะเบียน");
  if (!p.brand?.trim()) return fail("กรุณาระบุยี่ห้อ");

  const existing = await db.query.vehicles.findFirst({
    where: eq(vehicles.plateNumber, plate),
  });
  if (existing) return fail("มีรถทะเบียนนี้อยู่แล้ว");

  const [created] = await db
    .insert(vehicles)
    .values({
      plateNumber: plate,
      brand: p.brand.trim(),
      model: p.model?.trim() || null,
      year: p.year ?? null,
      color: p.color?.trim() || null,
      seats: p.seats ?? null,
      currentOdometer: p.currentOdometer ?? 0,
      note: p.note?.trim() || null,
    })
    .returning({ id: vehicles.id });

  await logAuditStandalone({
    actor: admin,
    entityType: "vehicle",
    entityId: created.id,
    action: "CREATE",
    after: p,
  });

  return ok({ id: created.id }, 201);
});
