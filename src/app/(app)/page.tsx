import Link from "next/link";
import { requireUserPage } from "@/lib/auth";
import { findOpenTrip, listVehicleStatus } from "@/lib/trips";
import { listTrips } from "@/lib/queries";
import { fmtDateTime, durationText } from "@/lib/datetime";
import TripCard from "@/components/TripCard";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await requireUserPage();
  const { denied } = await searchParams;

  const [openTrip, fleet, recent] = await Promise.all([
    findOpenTrip(user.id),
    listVehicleStatus(),
    listTrips({ driverId: user.id, statuses: ["COMPLETED"], limit: 3 }),
  ]);

  const freeCount = fleet.filter((f) => f.available).length;

  return (
    <div className="space-y-5">
      {denied && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          คุณไม่มีสิทธิ์เข้าถึงหน้าที่ร้องขอ
        </div>
      )}

      <div>
        <p className="text-sm text-slate-500">สวัสดี</p>
        <h1 className="text-xl font-bold text-slate-900">{user.name}</h1>
      </div>

      {openTrip ? (
        <section className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-4">
          <p className="text-xs font-medium text-indigo-700">คุณกำลังถือรถอยู่</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {fleet.find((f) => f.vehicle.id === openTrip.vehicleId)?.vehicle.brand}{" "}
            {fleet.find((f) => f.vehicle.id === openTrip.vehicleId)?.vehicle.model ?? ""}
          </p>
          <div className="mt-2 space-y-0.5 text-xs text-slate-600">
            <p>📍 {openTrip.destination}</p>
            <p>
              🕒 ออกไปเมื่อ {fmtDateTime(openTrip.checkedOutAt)} ({durationText(openTrip.checkedOutAt, new Date())})
            </p>
            {openTrip.expectedReturnAt && (
              <p>⏰ แจ้งว่าจะคืน {fmtDateTime(openTrip.expectedReturnAt)}</p>
            )}
          </div>
          <Link href={`/trips/${openTrip.id}/return`} className="btn-primary mt-3 w-full py-3 text-base">
            🏁 คืนรถ
          </Link>
          <Link
            href={`/trips/${openTrip.id}`}
            className="mt-2 block text-center text-xs text-blue-700"
          >
            ดูรายละเอียด
          </Link>
        </section>
      ) : (
        <Link href="/trips/new" className="btn-primary w-full py-4 text-base">
          🚗 เอารถออก
        </Link>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">สถานะรถตอนนี้</h2>
          <span className="text-xs text-slate-500">
            ว่าง {freeCount} / {fleet.length} คัน
          </span>
        </div>
        <div className="space-y-2">
          {fleet.map((f) => (
            <div key={f.vehicle.id} className="card py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {f.vehicle.brand} {f.vehicle.model ?? ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {f.vehicle.plateNumber} · {f.vehicle.currentOdometer.toLocaleString("th-TH")} กม.
                  </p>
                </div>
                <span
                  className={`chip ${
                    f.available
                      ? "bg-emerald-100 text-emerald-800"
                      : f.openTrip
                        ? "bg-indigo-100 text-indigo-800"
                        : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {f.available ? "ว่าง" : f.openTrip ? "ถูกใช้อยู่" : "ไม่พร้อมใช้"}
                </span>
              </div>
              {f.openTrip && (
                <p className="mt-1.5 text-xs text-slate-600">
                  👤 {f.openTrip.driverName} · 📍 {f.openTrip.destination}
                  <br />
                  🕒 ตั้งแต่ {fmtDateTime(f.openTrip.checkedOutAt)}
                </p>
              )}
              {f.block && <p className="mt-1.5 text-xs text-slate-500">🔒 {f.block.reason}</p>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">การใช้รถล่าสุดของคุณ</h2>
          <Link href="/trips" className="text-xs text-blue-700">
            ดูทั้งหมด →
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState text="ยังไม่มีประวัติการใช้รถ" />
        ) : (
          <div className="space-y-2">
            {recent.map((t) => (
              <TripCard key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
