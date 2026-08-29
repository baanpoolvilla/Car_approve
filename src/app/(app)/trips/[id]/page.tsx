import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, incidents, photos, trips, users, vehicles } from "@/db/schema";
import { isFleet, requireUserPage } from "@/lib/auth";
import { fmtDateTime, durationText } from "@/lib/datetime";
import { ANGLE_LABEL } from "@/lib/settings";
import { BackLink, Field, StatusBadge } from "@/components/ui";
import TripActions from "./TripActions";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  CHECKOUT: "เอารถออก",
  RETURN: "คืนรถ",
  CANCEL: "ยกเลิกรายการ",
  INCIDENT: "แจ้งอุบัติเหตุ",
  CLOSE: "ปิดรายงานเหตุ",
};

function PhotoGrid({ items }: { items: { id: string; angle: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {items.map((p) => (
        <a key={p.id} href={`/api/photos/${p.id}`} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/photos/${p.id}`}
            alt={ANGLE_LABEL[p.angle as keyof typeof ANGLE_LABEL] ?? p.angle}
            className="aspect-square w-full rounded-lg border border-slate-200 object-cover"
          />
          <p className="mt-0.5 text-center text-[10px] text-slate-500">
            {ANGLE_LABEL[p.angle as keyof typeof ANGLE_LABEL] ?? p.angle}
          </p>
        </a>
      ))}
    </div>
  );
}

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage();
  const { id } = await params;

  const rows = await db
    .select({ t: trips, v: vehicles, u: users })
    .from(trips)
    .innerJoin(users, eq(users.id, trips.driverId))
    .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
    .where(eq(trips.id, id))
    .limit(1);
  if (rows.length === 0) notFound();
  const { t, v, u } = rows[0];

  const [photoRows, incidentRows, trail] = await Promise.all([
    db.select().from(photos).where(eq(photos.tripId, id)).orderBy(asc(photos.createdAt)),
    db
      .select({ inc: incidents, name: users.name })
      .from(incidents)
      .innerJoin(users, eq(users.id, incidents.reportedBy))
      .where(eq(incidents.tripId, id))
      .orderBy(desc(incidents.occurredAt)),
    db.select().from(auditEvents).where(eq(auditEvents.entityId, id)).orderBy(asc(auditEvents.createdAt)),
  ]);

  const outPhotos = photoRows.filter((p) => p.phase === "BEFORE" && !p.incidentId);
  const inPhotos = photoRows.filter((p) => p.phase === "AFTER" && !p.incidentId);
  const distance = t.odometerIn !== null ? t.odometerIn - t.odometerOut : null;
  const isDriver = t.driverId === user.id;

  return (
    <div className="space-y-4">
      <BackLink href="/trips" label="ประวัติการใช้รถ" />

      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{t.tripNo}</p>
            <h1 className="text-lg font-bold text-slate-900">
              {v.brand} {v.model ?? ""}
            </h1>
            <p className="text-xs text-slate-500">{v.plateNumber}</p>
          </div>
          <StatusBadge status={t.status} />
        </div>
        <div className="mt-3">
          <Field label="ผู้ใช้รถ" value={`${u.name} (${u.email})`} />
          <Field label="จุดหมาย" value={t.destination} />
          <Field label="วัตถุประสงค์" value={t.purpose} />
          <Field label="คนในรถ" value={`${t.passengerCount} คน`} />
          {t.passengers && <Field label="ผู้ร่วมเดินทาง" value={t.passengers} />}
          {t.note && <Field label="หมายเหตุ" value={t.note} />}
          {t.cancelReason && <Field label="เหตุผลที่ยกเลิก" value={t.cancelReason} />}
        </div>
      </div>

      <TripActions
        tripId={t.id}
        status={t.status}
        isDriver={isDriver}
        canManage={isFleet(user)}
      />

      <section className="card">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">🚗 ตอนเอารถออก</h2>
        <Field label="เวลา" value={fmtDateTime(t.checkedOutAt)} />
        <Field label="เลขไมล์" value={`${t.odometerOut.toLocaleString("th-TH")} กม.`} />
        <Field label="ระดับน้ำมัน" value={`${t.fuelOut}%`} />
        {t.expectedReturnAt && (
          <Field label="แจ้งว่าจะคืน" value={fmtDateTime(t.expectedReturnAt)} />
        )}
        <PhotoGrid items={outPhotos} />
      </section>

      {t.returnedAt && (
        <section className="card">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">🏁 ตอนคืนรถ</h2>
          <Field label="เวลา" value={fmtDateTime(t.returnedAt)} />
          <Field label="ใช้ไปทั้งหมด" value={durationText(t.checkedOutAt, t.returnedAt)} />
          <Field label="เลขไมล์" value={`${(t.odometerIn ?? 0).toLocaleString("th-TH")} กม.`} />
          <Field
            label="ระยะทาง"
            value={distance !== null ? `${distance.toLocaleString("th-TH")} กม.` : "-"}
          />
          <Field label="ระดับน้ำมัน" value={`${t.fuelIn}%`} />
          <Field
            label="สภาพรถ"
            value={
              t.hasDamage ? <span className="text-red-600">มีความเสียหาย</span> : "ปกติดี"
            }
          />
          {t.damageNote && <Field label="รายละเอียด" value={t.damageNote} />}
          <PhotoGrid items={inPhotos} />
        </section>
      )}

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
                    สถานะ: <span className="font-medium">{inc.status === "CLOSED" ? "ปิดแล้ว" : "ยังไม่ปิด"}</span>
                  </p>
                  {inc.resolutionNote && (
                    <p className="text-xs text-slate-600">สรุป: {inc.resolutionNote}</p>
                  )}
                  <PhotoGrid items={pics} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Timeline</h2>
        <ol className="space-y-2">
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

      {t.status === "IN_USE" && isDriver && (
        <Link href={`/trips/${t.id}/incident`} className="btn-secondary w-full">
          ⚠️ แจ้งอุบัติเหตุ / เหตุผิดปกติ
        </Link>
      )}
    </div>
  );
}
