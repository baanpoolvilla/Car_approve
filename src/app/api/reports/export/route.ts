import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { inspections, users, vehicleRequests, vehicles } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";
import { fmtDateTime } from "@/lib/datetime";
import { handleError } from "@/lib/api";
import { STATUS_LABEL_MAP } from "@/lib/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  try {
    const user = await requireRole("FLEET_MANAGER", "AUDITOR");
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const vehicleId = url.searchParams.get("vehicleId");

    const conditions: (SQL | undefined)[] = [];
    if (from) conditions.push(gte(vehicleRequests.plannedStartAt, new Date(`${from}T00:00:00+07:00`)));
    if (to) conditions.push(lte(vehicleRequests.plannedStartAt, new Date(`${to}T23:59:59+07:00`)));
    if (vehicleId) conditions.push(eq(vehicleRequests.vehicleId, vehicleId));

    const rows = await db
      .select({ r: vehicleRequests, v: vehicles, u: users })
      .from(vehicleRequests)
      .innerJoin(users, eq(users.id, vehicleRequests.requesterId))
      .leftJoin(vehicles, eq(vehicles.id, vehicleRequests.vehicleId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(vehicleRequests.plannedStartAt))
      .limit(5000);

    const inspectionRows = await db.select().from(inspections);
    const byRequest = new Map<string, { before?: number; after?: number; fuelBefore?: number; fuelAfter?: number }>();
    for (const i of inspectionRows) {
      const entry = byRequest.get(i.requestId) ?? {};
      if (i.phase === "BEFORE") {
        entry.before = i.odometer;
        entry.fuelBefore = i.fuelLevel;
      } else {
        entry.after = i.odometer;
        entry.fuelAfter = i.fuelLevel;
      }
      byRequest.set(i.requestId, entry);
    }

    const header = [
      "เลขที่คำขอ",
      "สถานะ",
      "ผู้ขอ",
      "อีเมล",
      "รถ",
      "ทะเบียน",
      "เริ่ม",
      "สิ้นสุด",
      "วัตถุประสงค์",
      "จุดหมาย",
      "ผู้โดยสาร",
      "เลขไมล์ก่อน",
      "เลขไมล์หลัง",
      "ระยะทาง (กม.)",
      "น้ำมันก่อน (%)",
      "น้ำมันหลัง (%)",
      "ความเสียหายใหม่",
      "รับรถเมื่อ",
      "คืนรถเมื่อ",
      "ปิดงานเมื่อ",
    ];

    const lines = [header.map(csvCell).join(",")];
    for (const { r, v, u } of rows) {
      const odo = byRequest.get(r.id) ?? {};
      const distance =
        odo.before !== undefined && odo.after !== undefined ? odo.after - odo.before : "";
      lines.push(
        [
          r.requestNo,
          STATUS_LABEL_MAP[r.status] ?? r.status,
          u.name,
          u.email,
          v ? `${v.brand} ${v.model ?? ""}`.trim() : "",
          v?.plateNumber ?? "",
          fmtDateTime(r.plannedStartAt),
          fmtDateTime(r.plannedEndAt),
          r.purpose,
          r.destination,
          r.passengerCount,
          odo.before ?? "",
          odo.after ?? "",
          distance,
          odo.fuelBefore ?? "",
          odo.fuelAfter ?? "",
          r.hasNewDamage ? "มี" : "",
          r.checkedOutAt ? fmtDateTime(r.checkedOutAt) : "",
          r.returnedAt ? fmtDateTime(r.returnedAt) : "",
          r.completedAt ? fmtDateTime(r.completedAt) : "",
        ]
          .map(csvCell)
          .join(",")
      );
    }

    await logAuditStandalone({
      actor: user,
      entityType: "report",
      entityId: "vehicle-usage",
      action: "EXPORT",
      after: { from, to, vehicleId, rows: rows.length },
    });

    // UTF-8 BOM keeps Thai text readable when the file is opened in Excel.
    const csv = "﻿" + lines.join("\r\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="car-usage-${stamp}.csv"`,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
