import { and, asc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { trips, users, vehicles } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";
import { fmtDateTime } from "@/lib/datetime";
import { handleError } from "@/lib/api";
import { POWER_TYPE_LABEL, STATUS_LABEL_MAP } from "@/lib/labels";

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
    if (from) conditions.push(gte(trips.checkedOutAt, new Date(`${from}T00:00:00+07:00`)));
    if (to) conditions.push(lte(trips.checkedOutAt, new Date(`${to}T23:59:59+07:00`)));
    if (vehicleId) conditions.push(eq(trips.vehicleId, vehicleId));

    const rows = await db
      .select({ t: trips, v: vehicles, u: users })
      .from(trips)
      .innerJoin(users, eq(users.id, trips.driverId))
      .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(trips.checkedOutAt))
      .limit(5000);

    const header = [
      "เลขที่",
      "สถานะ",
      "ผู้ใช้รถ",
      "อีเมล",
      "รถ",
      "ทะเบียน",
      "ชนิดพลังงาน",
      "เอารถออกเมื่อ",
      "คืนรถเมื่อ",
      "วัตถุประสงค์",
      "จุดหมาย",
      "ผู้โดยสาร",
      "เลขไมล์ออก",
      "เลขไมล์คืน",
      "ระยะทาง (กม.)",
      "พลังงานออก (%)",
      "พลังงานคืน (%)",
      "ความเสียหาย",
      "รายละเอียดความเสียหาย",
      "หมายเหตุ",
    ];

    const lines = [header.map(csvCell).join(",")];
    for (const { t, v, u } of rows) {
      const distance = t.odometerIn !== null ? t.odometerIn - t.odometerOut : "";
      lines.push(
        [
          t.tripNo,
          STATUS_LABEL_MAP[t.status] ?? t.status,
          u.name,
          u.email,
          `${v.brand} ${v.model ?? ""}`.trim(),
          v.plateNumber,
          POWER_TYPE_LABEL[v.powerType] ?? v.powerType,
          fmtDateTime(t.checkedOutAt),
          t.returnedAt ? fmtDateTime(t.returnedAt) : "",
          t.purpose,
          t.destination,
          t.passengerCount,
          t.odometerOut,
          t.odometerIn ?? "",
          distance,
          t.energyOut,
          t.energyIn ?? "",
          t.hasDamage ? "มี" : "",
          t.damageNote ?? "",
          t.note ?? "",
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
