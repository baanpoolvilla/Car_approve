import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  approvalSteps,
  auditEvents,
  checklistDefinitions,
  incidents,
  inspectionChecklistItems,
  inspections,
  photos,
  users,
  vehicleRequests,
  vehicles,
} from "@/db/schema";
import { isFleet, requireUserPage } from "@/lib/auth";
import { fmtDateTime, fmtRange, durationText } from "@/lib/datetime";
import { ANGLE_LABEL } from "@/lib/settings";
import { BackLink, Field, StatusBadge } from "@/components/ui";
import RequestActions from "./RequestActions";

export const dynamic = "force-dynamic";

const RESULT_LABEL: Record<string, string> = {
  NORMAL: "ปกติ",
  DAMAGED: "ชำรุด",
  NOT_APPLICABLE: "ไม่มี/ไม่ตรวจ",
};

const ACTION_LABEL: Record<string, string> = {
  SUBMIT: "ส่งคำขออนุมัติ",
  APPROVE: "อนุมัติ",
  REJECT: "ไม่อนุมัติ",
  CANCEL: "ยกเลิกคำขอ",
  CHECKOUT: "รับรถ (ตรวจก่อนใช้)",
  RETURN: "คืนรถ (ตรวจหลังใช้)",
  COMPLETE: "ปิดงาน",
  INCIDENT: "รายงานอุบัติเหตุ",
  EXPIRE: "หมดอายุอัตโนมัติ",
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUserPage();
  const { id } = await params;

  const rows = await db
    .select({ r: vehicleRequests, v: vehicles, u: users })
    .from(vehicleRequests)
    .innerJoin(users, eq(users.id, vehicleRequests.requesterId))
    .leftJoin(vehicles, eq(vehicles.id, vehicleRequests.vehicleId))
    .where(eq(vehicleRequests.id, id))
    .limit(1);

  if (rows.length === 0) notFound();
  const { r, v, u } = rows[0];

  const [steps, inspectionRows, incidentRows, photoRows, checklistRows, definitions, trail] =
    await Promise.all([
      db
        .select({ s: approvalSteps, name: users.name, email: users.email })
        .from(approvalSteps)
        .innerJoin(users, eq(users.id, approvalSteps.approverId))
        .where(eq(approvalSteps.requestId, id))
        .orderBy(asc(approvalSteps.sequence)),
      db
        .select({ i: inspections, name: users.name })
        .from(inspections)
        .innerJoin(users, eq(users.id, inspections.submittedBy))
        .where(eq(inspections.requestId, id))
        .orderBy(asc(inspections.submittedAt)),
      db
        .select({ inc: incidents, name: users.name })
        .from(incidents)
        .innerJoin(users, eq(users.id, incidents.reportedBy))
        .where(eq(incidents.requestId, id))
        .orderBy(desc(incidents.occurredAt)),
      db.select().from(photos).where(eq(photos.requestId, id)).orderBy(asc(photos.createdAt)),
      db
        .select({ item: inspectionChecklistItems, def: checklistDefinitions })
        .from(inspectionChecklistItems)
        .innerJoin(
          checklistDefinitions,
          eq(checklistDefinitions.id, inspectionChecklistItems.checklistItemId)
        ),
      db.select().from(checklistDefinitions),
      db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, id))
        .orderBy(asc(auditEvents.createdAt)),
    ]);

  const isOwner = r.requesterId === user.id;
  const myPendingStep = steps.find((s) => s.s.approverId === user.id && s.s.status === "PENDING");
  const canManage = isFleet(user);

  // Any signed-in employee may read a trip record; only the buttons below are
  // gated by role.

  const inspectionIds = new Set(inspectionRows.map((x) => x.i.id));
  const itemsByInspection = new Map<string, typeof checklistRows>();
  for (const row of checklistRows) {
    if (!inspectionIds.has(row.item.inspectionId)) continue;
    const list = itemsByInspection.get(row.item.inspectionId) ?? [];
    list.push(row);
    itemsByInspection.set(row.item.inspectionId, list);
  }

  return (
    <div className="space-y-4">
      <BackLink href="/requests" label="รายการคำขอ" />

      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{r.requestNo}</p>
            <h1 className="text-lg font-bold text-slate-900">{r.purpose}</h1>
          </div>
          <StatusBadge status={r.status} />
        </div>
        <div className="mt-3">
          <Field label="ผู้ขอ" value={`${u.name} (${u.email})`} />
          <Field
            label="รถ"
            value={v ? `${v.brand} ${v.model ?? ""} · ${v.plateNumber}` : "-"}
          />
          <Field label="ช่วงเวลา" value={fmtRange(r.plannedStartAt, r.plannedEndAt)} />
          <Field label="ระยะเวลา" value={durationText(r.plannedStartAt, r.plannedEndAt)} />
          <Field label="จุดหมาย" value={r.destination} />
          <Field label="ผู้โดยสาร" value={`${r.passengerCount} คน`} />
          {r.passengers && <Field label="ผู้ร่วมเดินทาง" value={r.passengers} />}
          {r.note && <Field label="หมายเหตุ" value={r.note} />}
          {r.cancelReason && <Field label="เหตุผลที่ยกเลิก" value={r.cancelReason} />}
        </div>
      </div>

      <RequestActions
        requestId={r.id}
        status={r.status}
        isOwner={isOwner}
        canManage={canManage}
        pendingStepId={myPendingStep?.s.id ?? null}
      />

      <section className="card">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">ผู้อนุมัติ</h2>
        {steps.length === 0 && <p className="text-sm text-slate-400">-</p>}
        <div className="space-y-2">
          {steps.map(({ s, name, email }) => (
            <div key={s.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <p className="font-medium text-slate-800">{name}</p>
                <p className="text-xs text-slate-500">{email}</p>
                {s.decisionComment && (
                  <p className="mt-1 text-xs text-slate-600">💬 {s.decisionComment}</p>
                )}
              </div>
              <div className="text-right">
                <span
                  className={`chip ${
                    s.status === "APPROVED"
                      ? "bg-emerald-100 text-emerald-800"
                      : s.status === "REJECTED"
                        ? "bg-red-100 text-red-800"
                        : s.status === "PENDING"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {s.status === "APPROVED"
                    ? "อนุมัติ"
                    : s.status === "REJECTED"
                      ? "ไม่อนุมัติ"
                      : s.status === "PENDING"
                        ? "รอดำเนินการ"
                        : "ข้าม"}
                </span>
                {s.actedAt && (
                  <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(s.actedAt)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {inspectionRows.map(({ i, name }) => {
        const pics = photoRows.filter((p) => p.inspectionId === i.id);
        const items = itemsByInspection.get(i.id) ?? [];
        return (
          <section key={i.id} className="card">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">
              {i.phase === "BEFORE" ? "🔎 ตรวจก่อนใช้รถ" : "🏁 ตรวจหลังคืนรถ"}
            </h2>
            <Field label="ผู้ตรวจ" value={name} />
            <Field label="เวลา" value={fmtDateTime(i.submittedAt)} />
            <Field label="เลขไมล์" value={`${i.odometer.toLocaleString("th-TH")} กม.`} />
            <Field label="ระดับน้ำมัน" value={`${i.fuelLevel}%`} />
            <Field
              label="สภาพโดยรวม"
              value={
                i.generalStatus === "DAMAGED" ? (
                  <span className="text-red-600">พบความเสียหาย</span>
                ) : (
                  "ปกติ"
                )
              }
            />
            {i.damageNote && <Field label="รายละเอียดความเสียหาย" value={i.damageNote} />}

            {items.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-1 text-xs">
                {items.map(({ item, def }) => (
                  <div key={item.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-600">{def.name}</span>
                    <span
                      className={
                        item.result === "DAMAGED" ? "font-medium text-red-600" : "text-slate-500"
                      }
                    >
                      {RESULT_LABEL[item.result]}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {pics.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {pics.map((p) => (
                  <a key={p.id} href={`/api/photos/${p.id}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/photos/${p.id}`}
                      alt={ANGLE_LABEL[p.angle] ?? p.angle}
                      className="aspect-square w-full rounded-lg border border-slate-200 object-cover"
                    />
                    <p className="mt-0.5 text-center text-[10px] text-slate-500">
                      {ANGLE_LABEL[p.angle] ?? p.angle}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {incidentRows.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold text-red-700">⚠️ อุบัติเหตุ / เหตุผิดปกติ</h2>
          <div className="space-y-3">
            {incidentRows.map(({ inc, name }) => {
              const pics = photoRows.filter((p) => p.incidentId === inc.id);
              return (
                <div key={inc.id} className="rounded-lg bg-red-50 p-3">
                  <p className="text-sm font-medium text-slate-900">{inc.description}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {fmtDateTime(inc.occurredAt)} · {inc.location ?? "-"} · แจ้งโดย {name}
                  </p>
                  {inc.thirdParty && (
                    <p className="text-xs text-slate-600">คู่กรณี: {inc.thirdParty}</p>
                  )}
                  {(inc.policeReportNo || inc.insuranceClaimNo) && (
                    <p className="text-xs text-slate-600">
                      บันทึกประจำวัน: {inc.policeReportNo ?? "-"} · เคลมประกัน:{" "}
                      {inc.insuranceClaimNo ?? "-"}
                    </p>
                  )}
                  <p className="mt-1 text-xs">
                    สถานะ: <span className="font-medium">{inc.status}</span>
                  </p>
                  {pics.length > 0 && (
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      {pics.map((p) => (
                        <a key={p.id} href={`/api/photos/${p.id}`} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/photos/${p.id}`}
                            alt="รูปอุบัติเหตุ"
                            className="aspect-square w-full rounded-lg object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Timeline</h2>
        <ol className="space-y-2">
          <li className="text-sm">
            <span className="text-slate-400">{fmtDateTime(r.createdAt)}</span>{" "}
            <span className="text-slate-700">สร้างคำขอโดย {u.name}</span>
          </li>
          {trail.map((e) => (
            <li key={e.id} className="text-sm">
              <span className="text-slate-400">{fmtDateTime(e.createdAt)}</span>{" "}
              <span className="text-slate-700">
                {ACTION_LABEL[e.action] ?? e.action}
                {e.actorEmail ? ` — ${e.actorEmail}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {definitions.length === 0 && (
        <p className="text-center text-xs text-slate-400">
          <Link href="/admin/checklist" className="underline">
            ยังไม่ได้ตั้งค่า checklist
          </Link>
        </p>
      )}
    </div>
  );
}
