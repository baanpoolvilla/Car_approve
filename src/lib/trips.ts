import "server-only";
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, type DbLike, type Tx } from "@/db";
import {
  incidents,
  photos,
  trips,
  users,
  vehicleUnavailability,
  vehicles,
} from "@/db/schema";
import type { PhotoAngle } from "@/db/schema";
import { logAudit } from "./audit";
import { queueNotification } from "./notify";
import { getRequiredAngles } from "./settings";
import { powerWords } from "./labels";
import type { SessionUser } from "./auth";
import { supervisorRecipients } from "./recipients";

export class RuleError extends Error {
  status = 400;
}

const rule = (msg: string) => {
  throw new RuleError(msg);
};

/** Postgres unique-violation, raised by the "one open trip" partial indexes. */
export function isUniqueViolation(err: unknown) {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

const km = (n: number) => n.toLocaleString("th-TH");

/* ------------------------------------------------------------ numbering */

export async function nextTripNo(tx: DbLike): Promise<string> {
  const year = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(
      new Date()
    )
  );
  const res = await tx.execute(
    sql`INSERT INTO trip_counters (year, last_no) VALUES (${year}, 1)
        ON CONFLICT (year) DO UPDATE SET last_no = trip_counters.last_no + 1
        RETURNING last_no`
  );
  const rows = (res as unknown as { rows: { last_no: number }[] }).rows;
  return `CAR-${year}-${String(Number(rows[0].last_no)).padStart(6, "0")}`;
}

/* --------------------------------------------------------- vehicle state */

/** Every car with whether it is free right now, and who has it if not. */
export async function listVehicleStatus() {
  const now = new Date();

  const [fleet, open, blocks] = await Promise.all([
    db.select().from(vehicles).where(eq(vehicles.isActive, true)).orderBy(vehicles.brand),
    db
      .select({
        tripId: trips.id,
        tripNo: trips.tripNo,
        vehicleId: trips.vehicleId,
        driverId: trips.driverId,
        driverName: users.name,
        checkedOutAt: trips.checkedOutAt,
        destination: trips.destination,
        expectedReturnAt: trips.expectedReturnAt,
      })
      .from(trips)
      .innerJoin(users, eq(users.id, trips.driverId))
      .where(eq(trips.status, "IN_USE")),
    db
      .select()
      .from(vehicleUnavailability)
      .where(
        and(
          lt(vehicleUnavailability.startAt, now),
          sql`${vehicleUnavailability.endAt} > ${now}`
        )
      ),
  ]);

  return fleet.map((v) => {
    const openTrip = open.find((t) => t.vehicleId === v.id) ?? null;
    const block = blocks.find((b) => b.vehicleId === v.id) ?? null;
    return {
      vehicle: v,
      openTrip,
      block,
      available: !openTrip && !block && v.status !== "MAINTENANCE" && v.status !== "INACTIVE",
    };
  });
}

export async function findOpenTrip(driverId: string) {
  return db.query.trips.findFirst({
    where: and(eq(trips.driverId, driverId), eq(trips.status, "IN_USE")),
  });
}

/* -------------------------------------------------------- photo checking */

/**
 * Photos are taken before the trip row exists, so they are uploaded "loose"
 * (trip_id NULL, owned by the uploader) and attached when the trip is saved.
 */
async function loosePhotosOf(actorId: string, photoIds: string[]) {
  if (photoIds.length === 0) return [];
  return db
    .select({ id: photos.id, angle: photos.angle })
    .from(photos)
    .where(
      and(inArray(photos.id, photoIds), eq(photos.uploadedBy, actorId), isNull(photos.tripId))
    );
}

async function tripPhotosOf(tripId: string, photoIds: string[]) {
  if (photoIds.length === 0) return [];
  return db
    .select({ id: photos.id, angle: photos.angle })
    .from(photos)
    .where(and(inArray(photos.id, photoIds), eq(photos.tripId, tripId)));
}

async function assertAngles(
  found: { angle: string }[],
  needDamagePhoto: boolean
) {
  const angles = new Set(found.map((p) => p.angle as PhotoAngle));
  const required = await getRequiredAngles();
  const missing = required.filter((a) => !angles.has(a));
  if (missing.length > 0) rule(`ยังถ่ายรูปไม่ครบ: ${missing.join(", ")}`);
  if (needDamagePhoto && !angles.has("DAMAGE")) {
    rule("แจ้งว่ามีความเสียหาย กรุณาแนบรูปจุดเสียหายอย่างน้อย 1 รูป");
  }
}

/* ------------------------------------------------------------- เอารถออก */

export type StartTripInput = {
  vehicleId: string;
  purpose: string;
  destination: string;
  passengerCount: number;
  passengers?: string | null;
  note?: string | null;
  expectedReturnAt?: Date | null;
  odometer: number;
  energyLevel: number;
  photoIds: string[];
};

export async function startTrip(actor: SessionUser, input: StartTripInput, ip?: string | null) {
  if (!input.vehicleId) rule("กรุณาเลือกรถ");
  if (!input.purpose?.trim()) rule("กรุณาระบุวัตถุประสงค์");
  if (!input.destination?.trim()) rule("กรุณาระบุจุดหมาย");
  if (!Number.isInteger(input.odometer) || input.odometer < 0) rule("เลขไมล์ไม่ถูกต้อง");
  if (input.energyLevel < 0 || input.energyLevel > 100) rule("ระดับพลังงานต้องอยู่ระหว่าง 0–100");
  if (input.passengerCount < 1) rule("จำนวนผู้โดยสารต้องอย่างน้อย 1 คน");

  const vehicle = await db.query.vehicles.findFirst({ where: eq(vehicles.id, input.vehicleId) });
  if (!vehicle || !vehicle.isActive) rule("ไม่พบรถที่เลือก");
  if (vehicle!.status === "MAINTENANCE") rule("รถคันนี้อยู่ระหว่างซ่อมบำรุง");
  if (vehicle!.status === "INACTIVE") rule("รถคันนี้ถูกปิดใช้งาน");

  if (await findOpenTrip(actor.id)) rule("คุณยังถือรถอยู่อีกคัน กรุณาคืนรถคันเดิมก่อน");

  const now = new Date();
  const blocked = await db
    .select()
    .from(vehicleUnavailability)
    .where(
      and(
        eq(vehicleUnavailability.vehicleId, input.vehicleId),
        lt(vehicleUnavailability.startAt, now),
        sql`${vehicleUnavailability.endAt} > ${now}`
      )
    );
  if (blocked.length > 0) rule(`รถคันนี้ถูกปิดใช้งานอยู่ (${blocked[0].reason})`);

  if (input.odometer < vehicle!.currentOdometer) {
    rule(
      `เลขไมล์ที่กรอก (${km(input.odometer)}) น้อยกว่าที่บันทึกไว้ล่าสุด (${km(vehicle!.currentOdometer)}) กรุณาตรวจสอบ`
    );
  }

  const words = powerWords(vehicle!.powerType);

  const found = await loosePhotosOf(actor.id, input.photoIds);
  await assertAngles(found, false);
  const attachIds = found.map((p) => p.id);

  const out: { trip: { id: string; tripNo: string } | null } = { trip: null };
  let deliver: () => Promise<void> = async () => {};

  try {
    await db.transaction(async (tx: Tx) => {
      const tripNo = await nextTripNo(tx);
      const [row] = await tx
        .insert(trips)
        .values({
          tripNo,
          driverId: actor.id,
          vehicleId: input.vehicleId,
          purpose: input.purpose.trim(),
          destination: input.destination.trim(),
          passengerCount: input.passengerCount,
          passengers: input.passengers?.trim() || null,
          note: input.note?.trim() || null,
          expectedReturnAt: input.expectedReturnAt ?? null,
          status: "IN_USE",
          checkedOutAt: now,
          odometerOut: input.odometer,
          energyOut: input.energyLevel,
        })
        .returning({ id: trips.id, tripNo: trips.tripNo });

      await tx
        .update(photos)
        .set({ tripId: row.id, phase: "BEFORE" })
        .where(and(inArray(photos.id, attachIds), isNull(photos.tripId)));

      await tx
        .update(vehicles)
        .set({ status: "IN_USE", currentOdometer: input.odometer, updatedAt: now })
        .where(eq(vehicles.id, input.vehicleId));

      await logAudit(tx, {
        actor,
        entityType: "trip",
        entityId: row.id,
        action: "CHECKOUT",
        after: {
          tripNo,
          vehicleId: input.vehicleId,
          destination: input.destination,
          purpose: input.purpose,
          odometer: input.odometer,
          energyLevel: input.energyLevel,
        },
        ip,
      });

      deliver = await queueNotification(tx, {
        userIds: await supervisorRecipients(tx, actor.id),
        type: "TRIP_STARTED",
        title: `${actor.name} เอารถออก — ${vehicle!.brand} ${vehicle!.model ?? ""}`,
        body: `${tripNo}\nจุดหมาย: ${input.destination}\nวัตถุประสงค์: ${input.purpose}\nเลขไมล์ ${km(input.odometer)} กม. · ${words.short} ${input.energyLevel}%`,
        link: `/trips/${row.id}`,
      });

      out.trip = row;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      rule("รถคันนี้เพิ่งถูกเอาออกไปใช้โดยคนอื่น กรุณารีเฟรชหน้าจอ");
    }
    throw err;
  }

  await deliver();
  return out.trip!;
}

/* ----------------------------------------------------------------- คืนรถ */

export type EndTripInput = {
  odometer: number;
  energyLevel: number;
  hasDamage: boolean;
  damageNote?: string | null;
  photoIds: string[];
};

export async function endTrip(
  actor: SessionUser,
  tripId: string,
  input: EndTripInput,
  ip?: string | null
) {
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
  if (!trip) rule("ไม่พบรายการ");
  if (trip!.status !== "IN_USE") rule("รายการนี้คืนรถไปแล้ว");

  const canReturn =
    trip!.driverId === actor.id ||
    actor.roles.includes("FLEET_MANAGER") ||
    actor.roles.includes("ADMIN");
  if (!canReturn) rule("คุณไม่มีสิทธิ์คืนรถของรายการนี้");

  if (!Number.isInteger(input.odometer) || input.odometer < 0) rule("เลขไมล์ไม่ถูกต้อง");
  if (input.energyLevel < 0 || input.energyLevel > 100) rule("ระดับพลังงานต้องอยู่ระหว่าง 0–100");
  if (input.odometer < trip!.odometerOut) {
    rule(
      `เลขไมล์ตอนคืน (${km(input.odometer)}) ต้องไม่น้อยกว่าตอนเอารถออก (${km(trip!.odometerOut)})`
    );
  }
  if (input.hasDamage && !input.damageNote?.trim()) {
    rule("แจ้งว่ามีความเสียหาย กรุณาระบุรายละเอียด");
  }

  const found = await tripPhotosOf(tripId, input.photoIds);
  await assertAngles(found, input.hasDamage);
  const attachIds = found.map((p) => p.id);

  const now = new Date();
  const distance = input.odometer - trip!.odometerOut;
  let deliver: () => Promise<void> = async () => {};

  await db.transaction(async (tx: Tx) => {
    await tx
      .update(photos)
      .set({ phase: "AFTER" })
      .where(and(inArray(photos.id, attachIds), eq(photos.tripId, tripId)));

    await tx
      .update(trips)
      .set({
        status: "COMPLETED",
        returnedAt: now,
        odometerIn: input.odometer,
        energyIn: input.energyLevel,
        hasDamage: input.hasDamage,
        damageNote: input.damageNote?.trim() || null,
        updatedAt: now,
      })
      .where(and(eq(trips.id, tripId), eq(trips.status, "IN_USE")));

    await tx
      .update(vehicles)
      .set({ status: "AVAILABLE", currentOdometer: input.odometer, updatedAt: now })
      .where(eq(vehicles.id, trip!.vehicleId));

    await logAudit(tx, {
      actor,
      entityType: "trip",
      entityId: tripId,
      action: "RETURN",
      before: { status: "IN_USE" },
      after: {
        status: "COMPLETED",
        odometer: input.odometer,
        energyLevel: input.energyLevel,
        distance,
        hasDamage: input.hasDamage,
      },
      ip,
    });

    const [vehicle] = await tx
      .select({ brand: vehicles.brand, model: vehicles.model, powerType: vehicles.powerType })
      .from(vehicles)
      .where(eq(vehicles.id, trip!.vehicleId));
    const words = powerWords(vehicle?.powerType ?? "EV");

    deliver = await queueNotification(tx, {
      userIds: await supervisorRecipients(tx, actor.id),
      type: input.hasDamage ? "TRIP_DAMAGE" : "TRIP_ENDED",
      title: input.hasDamage
        ? `⚠️ ${actor.name} คืนรถพร้อมแจ้งความเสียหาย`
        : `${actor.name} คืนรถแล้ว — ${vehicle?.brand ?? ""} ${vehicle?.model ?? ""}`,
      body: `${trip!.tripNo}\nระยะทาง ${km(distance)} กม. · ${words.short}เหลือ ${input.energyLevel}%${
        input.hasDamage ? `\nความเสียหาย: ${input.damageNote}` : ""
      }`,
      link: `/trips/${tripId}`,
    });
  });

  await deliver();
  return { distance };
}

/* ---------------------------------------------------------------- ยกเลิก */

/** For a trip opened by mistake, only while the car has not been returned. */
export async function cancelTrip(
  actor: SessionUser,
  tripId: string,
  reason: string,
  ip?: string | null
) {
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
  if (!trip) rule("ไม่พบรายการ");
  if (trip!.status !== "IN_USE") rule("ยกเลิกได้เฉพาะรายการที่ยังไม่คืนรถ");

  const allowed =
    trip!.driverId === actor.id ||
    actor.roles.includes("FLEET_MANAGER") ||
    actor.roles.includes("ADMIN");
  if (!allowed) rule("คุณไม่มีสิทธิ์ยกเลิกรายการนี้");
  if (!reason.trim()) rule("กรุณาระบุเหตุผลที่ยกเลิก");

  const now = new Date();
  await db.transaction(async (tx: Tx) => {
    await tx
      .update(trips)
      .set({ status: "CANCELLED", cancelledAt: now, cancelReason: reason.trim(), updatedAt: now })
      .where(and(eq(trips.id, tripId), eq(trips.status, "IN_USE")));

    // The odometer reading itself was real, so it stays; only the car frees up.
    await tx
      .update(vehicles)
      .set({ status: "AVAILABLE", updatedAt: now })
      .where(eq(vehicles.id, trip!.vehicleId));

    await logAudit(tx, {
      actor,
      entityType: "trip",
      entityId: tripId,
      action: "CANCEL",
      before: { status: "IN_USE" },
      after: { status: "CANCELLED", reason },
      ip,
    });
  });
}

/* --------------------------------------------------------------- เหตุการณ์ */

export async function closeIncident(
  actor: SessionUser,
  incidentId: string,
  note: string,
  ip?: string | null
) {
  const incident = await db.query.incidents.findFirst({ where: eq(incidents.id, incidentId) });
  if (!incident) rule("ไม่พบรายงานเหตุ");
  if (incident!.status === "CLOSED") rule("รายงานนี้ปิดไปแล้ว");

  const now = new Date();
  await db.transaction(async (tx: Tx) => {
    await tx
      .update(incidents)
      .set({
        status: "CLOSED",
        closedBy: actor.id,
        closedAt: now,
        resolutionNote: note.trim() || null,
        updatedAt: now,
      })
      .where(eq(incidents.id, incidentId));

    await logAudit(tx, {
      actor,
      entityType: "incident",
      entityId: incidentId,
      action: "CLOSE",
      after: { note },
      ip,
    });
  });
}

/** Cars still out past the time the driver said they would be back. */
export async function overdueTrips() {
  return db
    .select({
      id: trips.id,
      tripNo: trips.tripNo,
      driverId: trips.driverId,
      driverName: users.name,
      expectedReturnAt: trips.expectedReturnAt,
      brand: vehicles.brand,
      model: vehicles.model,
    })
    .from(trips)
    .innerJoin(users, eq(users.id, trips.driverId))
    .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(
      and(
        eq(trips.status, "IN_USE"),
        isNotNull(trips.expectedReturnAt),
        lt(trips.expectedReturnAt, new Date())
      )
    );
}
