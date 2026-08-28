import "server-only";
import { and, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { db, type DbLike, type Tx } from "@/db";
import {
  approvalSteps,
  checklistDefinitions,
  incidents,
  inspectionChecklistItems,
  inspections,
  photos,
  requestCounters,
  termsAcceptances,
  termsVersions,
  userRoles,
  users,
  vehicleRequests,
  vehicleUnavailability,
  vehicles,
} from "@/db/schema";
import type { PhotoAngle, RequestStatus } from "@/db/schema";
import { logAudit } from "./audit";
import { queueNotification } from "./notify";
import { getRequiredAngles } from "./settings";
import { fmtRange } from "./datetime";
import type { SessionUser } from "./auth";

export class RuleError extends Error {
  status = 400;
}

const rule = (msg: string) => {
  throw new RuleError(msg);
};

/** Statuses that hold a hard reservation on a vehicle. */
export const BLOCKING_STATUSES: RequestStatus[] = ["APPROVED", "CHECKED_OUT", "RETURNED"];

export function isOverlapViolation(err: unknown) {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23P01";
}

/* ------------------------------------------------------------ numbering */

export async function nextRequestNo(tx: DbLike): Promise<string> {
  const year = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric" }).format(
      new Date()
    )
  );
  const res = await tx.execute(
    sql`INSERT INTO request_counters (year, last_no) VALUES (${year}, 1)
        ON CONFLICT (year) DO UPDATE SET last_no = request_counters.last_no + 1
        RETURNING last_no`
  );
  const rows = (res as unknown as { rows: { last_no: number }[] }).rows;
  const n = Number(rows[0].last_no);
  return `CAR-${year}-${String(n).padStart(6, "0")}`;
}

/* ---------------------------------------------------------- availability */

export async function findConflicts(
  vehicleId: string,
  start: Date,
  end: Date,
  excludeRequestId?: string
) {
  const conflicts = await db
    .select({
      id: vehicleRequests.id,
      requestNo: vehicleRequests.requestNo,
      status: vehicleRequests.status,
      start: vehicleRequests.plannedStartAt,
      end: vehicleRequests.plannedEndAt,
      requester: users.name,
    })
    .from(vehicleRequests)
    .innerJoin(users, eq(users.id, vehicleRequests.requesterId))
    .where(
      and(
        eq(vehicleRequests.vehicleId, vehicleId),
        inArray(vehicleRequests.status, [...BLOCKING_STATUSES, "PENDING_APPROVAL"]),
        lt(vehicleRequests.plannedStartAt, end),
        gt(vehicleRequests.plannedEndAt, start),
        excludeRequestId ? ne(vehicleRequests.id, excludeRequestId) : undefined
      )
    );

  const blocks = await db
    .select()
    .from(vehicleUnavailability)
    .where(
      and(
        eq(vehicleUnavailability.vehicleId, vehicleId),
        lt(vehicleUnavailability.startAt, end),
        gt(vehicleUnavailability.endAt, start)
      )
    );

  return { conflicts, blocks };
}

export async function listAvailableVehicles(start: Date, end: Date, excludeRequestId?: string) {
  const all = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.isActive, true))
    .orderBy(vehicles.brand);

  const result = [];
  for (const v of all) {
    const { conflicts, blocks } = await findConflicts(v.id, start, end, excludeRequestId);
    const hardConflicts = conflicts.filter((c) =>
      BLOCKING_STATUSES.includes(c.status as RequestStatus)
    );
    result.push({
      vehicle: v,
      available:
        v.status !== "MAINTENANCE" &&
        v.status !== "INACTIVE" &&
        hardConflicts.length === 0 &&
        blocks.length === 0,
      hardConflicts,
      pendingConflicts: conflicts.filter((c) => c.status === "PENDING_APPROVAL"),
      blocks,
    });
  }
  return result;
}

/* --------------------------------------------------------------- create */

export type RequestInput = {
  vehicleId: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  purpose: string;
  destination: string;
  passengerCount: number;
  passengers?: string | null;
  note?: string | null;
};

function validateInput(input: RequestInput) {
  if (!input.vehicleId) rule("กรุณาเลือกรถ");
  if (!(input.plannedEndAt > input.plannedStartAt)) rule("เวลาสิ้นสุดต้องหลังเวลาเริ่ม");
  if (!input.purpose?.trim()) rule("กรุณาระบุวัตถุประสงค์");
  if (!input.destination?.trim()) rule("กรุณาระบุจุดหมาย");
  if (input.passengerCount < 1) rule("จำนวนผู้โดยสารต้องอย่างน้อย 1 คน");
}

export async function createAndSubmitRequest(
  actor: SessionUser,
  input: RequestInput,
  opts: { acceptTerms: boolean; ip?: string | null }
) {
  validateInput(input);
  if (!opts.acceptTerms) rule("กรุณายอมรับเงื่อนไขการใช้รถก่อนส่งคำขอ");

  const vehicle = await db.query.vehicles.findFirst({
    where: eq(vehicles.id, input.vehicleId),
  });
  if (!vehicle || !vehicle.isActive) rule("ไม่พบรถที่เลือก");
  if (vehicle!.status === "MAINTENANCE" || vehicle!.status === "INACTIVE") {
    rule("รถคันนี้ไม่พร้อมใช้งาน");
  }

  const { conflicts, blocks } = await findConflicts(
    input.vehicleId,
    input.plannedStartAt,
    input.plannedEndAt
  );
  if (blocks.length > 0) rule(`รถถูกปิดใช้งานช่วงเวลานี้ (${blocks[0].reason})`);
  const hard = conflicts.filter((c) => BLOCKING_STATUSES.includes(c.status as RequestStatus));
  if (hard.length > 0) {
    rule(`รถคันนี้ถูกจองแล้วในช่วง ${fmtRange(hard[0].start, hard[0].end)} (${hard[0].requestNo})`);
  }

  const approvers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(userRoles.role, "APPROVER"), eq(users.isActive, true), ne(users.id, actor.id)));

  if (approvers.length === 0) {
    rule("ยังไม่มีผู้อนุมัติที่ใช้งานได้ กรุณาติดต่อผู้ดูแลระบบ");
  }

  const activeTerms = await db.query.termsVersions.findFirst({
    where: eq(termsVersions.isActive, true),
  });

  const out: { created: { id: string; requestNo: string } | null } = { created: null };
  let deliver: () => Promise<void> = async () => {};

  await db.transaction(async (tx: Tx) => {
    const requestNo = await nextRequestNo(tx);
    const [row] = await tx
      .insert(vehicleRequests)
      .values({
        requestNo,
        requesterId: actor.id,
        vehicleId: input.vehicleId,
        plannedStartAt: input.plannedStartAt,
        plannedEndAt: input.plannedEndAt,
        purpose: input.purpose.trim(),
        destination: input.destination.trim(),
        passengerCount: input.passengerCount,
        passengers: input.passengers?.trim() || null,
        note: input.note?.trim() || null,
        status: "PENDING_APPROVAL",
        submittedAt: new Date(),
      })
      .returning({ id: vehicleRequests.id, requestNo: vehicleRequests.requestNo });

    await tx.insert(approvalSteps).values(
      approvers.map((a, i) => ({
        requestId: row.id,
        sequence: i + 1,
        approverId: a.id,
        status: "PENDING" as const,
      }))
    );

    if (activeTerms) {
      await tx.insert(termsAcceptances).values({
        termsVersionId: activeTerms.id,
        userId: actor.id,
        requestId: row.id,
        ipAddress: opts.ip ?? null,
      });
    }

    await logAudit(tx, {
      actor,
      entityType: "vehicle_request",
      entityId: row.id,
      action: "SUBMIT",
      after: { requestNo, ...input, status: "PENDING_APPROVAL" },
      ip: opts.ip,
    });

    deliver = await queueNotification(tx, {
      userIds: approvers.map((a) => a.id),
      type: "APPROVAL_REQUESTED",
      title: `มีคำขอใช้รถรออนุมัติ ${requestNo}`,
      body: `${actor.name} ขอใช้ ${vehicle!.brand} ${vehicle!.model ?? ""} ${fmtRange(
        input.plannedStartAt,
        input.plannedEndAt
      )}\nจุดหมาย: ${input.destination}`,
      link: `/requests/${row.id}`,
    });

    out.created = row;
  });

  await deliver();
  return out.created!;
}

/* ---------------------------------------------------------------- cancel */

export async function cancelRequest(
  actor: SessionUser,
  requestId: string,
  reason: string,
  ip?: string | null
) {
  const req = await db.query.vehicleRequests.findFirst({
    where: eq(vehicleRequests.id, requestId),
  });
  if (!req) rule("ไม่พบคำขอ");
  const canCancel =
    req!.requesterId === actor.id || actor.roles.includes("ADMIN") || actor.roles.includes("FLEET_MANAGER");
  if (!canCancel) rule("คุณไม่มีสิทธิ์ยกเลิกคำขอนี้");
  if (!["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(req!.status)) {
    rule("สถานะปัจจุบันยกเลิกไม่ได้");
  }

  let deliver: () => Promise<void> = async () => {};
  await db.transaction(async (tx: Tx) => {
    await tx
      .update(vehicleRequests)
      .set({
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason || null,
        updatedAt: new Date(),
      })
      .where(eq(vehicleRequests.id, requestId));

    await tx
      .update(approvalSteps)
      .set({ status: "SKIPPED" })
      .where(and(eq(approvalSteps.requestId, requestId), eq(approvalSteps.status, "PENDING")));

    await logAudit(tx, {
      actor,
      entityType: "vehicle_request",
      entityId: requestId,
      action: "CANCEL",
      before: { status: req!.status },
      after: { status: "CANCELLED", reason },
      ip,
    });

    if (req!.requesterId !== actor.id) {
      deliver = await queueNotification(tx, {
        userIds: [req!.requesterId],
        type: "REQUEST_CANCELLED",
        title: `คำขอ ${req!.requestNo} ถูกยกเลิก`,
        body: reason,
        link: `/requests/${requestId}`,
      });
    }
  });
  await deliver();
}

/* -------------------------------------------------------------- approval */

export async function decideApproval(
  actor: SessionUser,
  stepId: string,
  decision: "APPROVED" | "REJECTED",
  comment: string,
  ip?: string | null
) {
  const step = await db.query.approvalSteps.findFirst({
    where: eq(approvalSteps.id, stepId),
  });
  if (!step) rule("ไม่พบรายการอนุมัติ");
  if (step!.approverId !== actor.id) rule("คุณไม่ใช่ผู้อนุมัติของรายการนี้");
  if (step!.status !== "PENDING") rule("รายการนี้ถูกดำเนินการไปแล้ว");

  const req = await db.query.vehicleRequests.findFirst({
    where: eq(vehicleRequests.id, step!.requestId),
  });
  if (!req) rule("ไม่พบคำขอ");
  if (req!.status !== "PENDING_APPROVAL") rule("คำขอนี้ไม่ได้อยู่ในสถานะรออนุมัติ");
  if (req!.requesterId === actor.id) rule("ไม่สามารถอนุมัติคำขอของตนเองได้");
  if (decision === "REJECTED" && !comment.trim()) rule("กรุณาระบุเหตุผลที่ปฏิเสธ");

  const now = new Date();
  let deliver: () => Promise<void> = async () => {};

  try {
    await db.transaction(async (tx: Tx) => {
      await tx
        .update(approvalSteps)
        .set({ status: decision, decisionComment: comment.trim() || null, actedAt: now })
        .where(eq(approvalSteps.id, stepId));

      // Single-level approval: the first decision settles the request.
      await tx
        .update(approvalSteps)
        .set({ status: "SKIPPED", actedAt: now })
        .where(
          and(
            eq(approvalSteps.requestId, req!.id),
            eq(approvalSteps.status, "PENDING"),
            ne(approvalSteps.id, stepId)
          )
        );

      await tx
        .update(vehicleRequests)
        .set({
          status: decision === "APPROVED" ? "APPROVED" : "REJECTED",
          decidedAt: now,
          updatedAt: now,
        })
        .where(and(eq(vehicleRequests.id, req!.id), eq(vehicleRequests.status, "PENDING_APPROVAL")));

      await logAudit(tx, {
        actor,
        entityType: "vehicle_request",
        entityId: req!.id,
        action: decision === "APPROVED" ? "APPROVE" : "REJECT",
        before: { status: "PENDING_APPROVAL" },
        after: { status: decision, comment },
        ip,
      });

      deliver = await queueNotification(tx, {
        userIds: [req!.requesterId],
        type: decision === "APPROVED" ? "REQUEST_APPROVED" : "REQUEST_REJECTED",
        title:
          decision === "APPROVED"
            ? `คำขอ ${req!.requestNo} ได้รับการอนุมัติ`
            : `คำขอ ${req!.requestNo} ถูกปฏิเสธ`,
        body: `${actor.name}: ${comment || "-"}`,
        link: `/requests/${req!.id}`,
      });
    });
  } catch (err) {
    if (isOverlapViolation(err)) {
      rule("ไม่สามารถอนุมัติได้ เนื่องจากรถคันนี้ถูกจองซ้อนช่วงเวลาเดียวกันแล้ว");
    }
    throw err;
  }

  await deliver();
  return req!.id;
}

/* ------------------------------------------------------------ inspection */

export type ChecklistAnswer = {
  checklistItemId: string;
  result: "NORMAL" | "DAMAGED" | "NOT_APPLICABLE";
  note?: string | null;
};

export type InspectionInput = {
  phase: "BEFORE" | "AFTER";
  odometer: number;
  fuelLevel: number;
  damageNote?: string | null;
  checklist: ChecklistAnswer[];
  photoIds: string[];
};

export async function saveInspectionAndAdvance(
  actor: SessionUser,
  requestId: string,
  input: InspectionInput,
  ip?: string | null
) {
  const req = await db.query.vehicleRequests.findFirst({
    where: eq(vehicleRequests.id, requestId),
  });
  if (!req) rule("ไม่พบคำขอ");
  if (req!.requesterId !== actor.id && !actor.roles.includes("FLEET_MANAGER") && !actor.roles.includes("ADMIN")) {
    rule("คุณไม่มีสิทธิ์ตรวจรถของคำขอนี้");
  }

  if (input.phase === "BEFORE" && req!.status !== "APPROVED") {
    rule("ต้องได้รับการอนุมัติก่อนจึงจะรับรถได้");
  }
  if (input.phase === "AFTER" && req!.status !== "CHECKED_OUT") {
    rule("ต้องรับรถก่อนจึงจะคืนรถได้");
  }

  if (!Number.isInteger(input.odometer) || input.odometer < 0) rule("เลขไมล์ไม่ถูกต้อง");
  if (input.fuelLevel < 0 || input.fuelLevel > 100) rule("ระดับน้ำมันต้องอยู่ระหว่าง 0–100");

  const definitions = await db
    .select()
    .from(checklistDefinitions)
    .where(eq(checklistDefinitions.isActive, true));
  const requiredIds = definitions.filter((d) => d.isRequired).map((d) => d.id);
  const answered = new Map(input.checklist.map((c) => [c.checklistItemId, c]));
  for (const id of requiredIds) {
    if (!answered.has(id)) rule("กรุณาตรวจรายการ checklist ให้ครบทุกข้อ");
  }

  const damaged = input.checklist.filter((c) => c.result === "DAMAGED");
  const hasDamage = damaged.length > 0;
  if (hasDamage) {
    if (!input.damageNote?.trim() && !damaged.some((d) => d.note?.trim())) {
      rule("พบรายการชำรุด กรุณาระบุรายละเอียดความเสียหาย");
    }
  }

  // Photos must already be uploaded and owned by this request.
  const uploaded = input.photoIds.length
    ? await db
        .select({ id: photos.id, angle: photos.angle })
        .from(photos)
        .where(and(inArray(photos.id, input.photoIds), eq(photos.requestId, requestId)))
    : [];

  const angles = new Set(uploaded.map((p) => p.angle as PhotoAngle));
  const required = await getRequiredAngles();
  const missing = required.filter((a) => !angles.has(a));
  if (missing.length > 0) rule(`ยังถ่ายรูปไม่ครบ: ${missing.join(", ")}`);
  if (hasDamage && !angles.has("DAMAGE")) rule("พบรายการชำรุด กรุณาแนบรูปจุดเสียหายอย่างน้อย 1 รูป");

  if (input.phase === "AFTER") {
    const before = await db.query.inspections.findFirst({
      where: and(eq(inspections.requestId, requestId), eq(inspections.phase, "BEFORE")),
    });
    if (!before) rule("ไม่พบข้อมูลตรวจรถก่อนใช้");
    if (input.odometer < before!.odometer) {
      rule(`เลขไมล์หลังใช้ (${input.odometer}) ต้องไม่น้อยกว่าก่อนใช้ (${before!.odometer})`);
    }
  }

  const now = new Date();
  let deliver: () => Promise<void> = async () => {};
  const out: { nextStatus: RequestStatus } = { nextStatus: req!.status };

  await db.transaction(async (tx: Tx) => {
    const [ins] = await tx
      .insert(inspections)
      .values({
        requestId,
        phase: input.phase,
        odometer: input.odometer,
        fuelLevel: input.fuelLevel,
        generalStatus: hasDamage ? "DAMAGED" : "NORMAL",
        damageNote: input.damageNote?.trim() || null,
        submittedBy: actor.id,
        submittedAt: now,
      })
      .returning({ id: inspections.id });

    if (input.checklist.length > 0) {
      await tx.insert(inspectionChecklistItems).values(
        input.checklist.map((c) => ({
          inspectionId: ins.id,
          checklistItemId: c.checklistItemId,
          result: c.result,
          note: c.note?.trim() || null,
        }))
      );
    }

    if (input.photoIds.length > 0) {
      await tx
        .update(photos)
        .set({ inspectionId: ins.id, phase: input.phase })
        .where(and(inArray(photos.id, input.photoIds), eq(photos.requestId, requestId)));
    }

    if (input.phase === "BEFORE") {
      out.nextStatus = "CHECKED_OUT";
      await tx
        .update(vehicleRequests)
        .set({ status: "CHECKED_OUT", checkedOutAt: now, updatedAt: now })
        .where(and(eq(vehicleRequests.id, requestId), eq(vehicleRequests.status, "APPROVED")));
      await tx
        .update(vehicles)
        .set({ status: "IN_USE", currentOdometer: input.odometer, updatedAt: now })
        .where(eq(vehicles.id, req!.vehicleId!));
    } else {
      const openIncidents = await tx
        .select({ id: incidents.id })
        .from(incidents)
        .where(and(eq(incidents.requestId, requestId), ne(incidents.status, "CLOSED")));

      const needsReview = hasDamage || openIncidents.length > 0;
      out.nextStatus = needsReview ? "RETURNED" : "COMPLETED";
      await tx
        .update(vehicleRequests)
        .set({
          status: out.nextStatus,
          returnedAt: now,
          completedAt: needsReview ? null : now,
          hasNewDamage: hasDamage,
          updatedAt: now,
        })
        .where(and(eq(vehicleRequests.id, requestId), eq(vehicleRequests.status, "CHECKED_OUT")));
      await tx
        .update(vehicles)
        .set({ status: "AVAILABLE", currentOdometer: input.odometer, updatedAt: now })
        .where(eq(vehicles.id, req!.vehicleId!));
    }

    await logAudit(tx, {
      actor,
      entityType: "vehicle_request",
      entityId: requestId,
      action: input.phase === "BEFORE" ? "CHECKOUT" : "RETURN",
      before: { status: req!.status },
      after: {
        status: out.nextStatus,
        odometer: input.odometer,
        fuelLevel: input.fuelLevel,
        damaged: hasDamage,
      },
      ip,
    });

    if (input.phase === "AFTER" && out.nextStatus === "RETURNED") {
      const fleet = await tx
        .select({ id: users.id })
        .from(users)
        .innerJoin(userRoles, eq(userRoles.userId, users.id))
        .where(and(eq(userRoles.role, "FLEET_MANAGER"), eq(users.isActive, true)));
      deliver = await queueNotification(tx, {
        userIds: fleet.map((f) => f.id),
        type: "DAMAGE_REPORTED",
        title: `พบความเสียหาย/เหตุผิดปกติ ${req!.requestNo}`,
        body: `${actor.name} คืนรถพร้อมรายงานความเสียหาย กรุณาตรวจสอบและปิดงาน`,
        link: `/requests/${requestId}`,
      });
    }
  });

  await deliver();
  return out.nextStatus;
}

/* -------------------------------------------------------------- complete */

export async function completeRequest(
  actor: SessionUser,
  requestId: string,
  note: string,
  ip?: string | null
) {
  const req = await db.query.vehicleRequests.findFirst({
    where: eq(vehicleRequests.id, requestId),
  });
  if (!req) rule("ไม่พบคำขอ");
  if (req!.status !== "RETURNED") rule("ปิดงานได้เฉพาะรายการที่คืนรถแล้ว");

  const now = new Date();
  let deliver: () => Promise<void> = async () => {};
  await db.transaction(async (tx: Tx) => {
    await tx
      .update(vehicleRequests)
      .set({ status: "COMPLETED", completedAt: now, updatedAt: now })
      .where(and(eq(vehicleRequests.id, requestId), eq(vehicleRequests.status, "RETURNED")));

    await tx
      .update(incidents)
      .set({ status: "CLOSED", closedBy: actor.id, closedAt: now, resolutionNote: note || null })
      .where(and(eq(incidents.requestId, requestId), ne(incidents.status, "CLOSED")));

    await logAudit(tx, {
      actor,
      entityType: "vehicle_request",
      entityId: requestId,
      action: "COMPLETE",
      before: { status: "RETURNED" },
      after: { status: "COMPLETED", note },
      ip,
    });

    deliver = await queueNotification(tx, {
      userIds: [req!.requesterId],
      type: "REQUEST_COMPLETED",
      title: `ปิดงาน ${req!.requestNo} เรียบร้อย`,
      body: note,
      link: `/requests/${requestId}`,
    });
  });
  await deliver();
}

/* -------------------------------------------------------------- expiring */

export async function expireStaleRequests() {
  const cutoff = new Date();
  const stale = await db
    .select({ id: vehicleRequests.id })
    .from(vehicleRequests)
    .where(
      and(
        eq(vehicleRequests.status, "APPROVED"),
        lt(vehicleRequests.plannedEndAt, cutoff)
      )
    );
  if (stale.length === 0) return 0;

  await db
    .update(vehicleRequests)
    .set({ status: "EXPIRED", updatedAt: new Date() })
    .where(
      inArray(
        vehicleRequests.id,
        stale.map((s) => s.id)
      )
    );
  await logAudit(db, {
    entityType: "vehicle_request",
    action: "EXPIRE",
    after: { count: stale.length, ids: stale.map((s) => s.id) },
  });
  return stale.length;
}
