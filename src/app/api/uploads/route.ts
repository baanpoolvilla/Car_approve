import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files, photoAngleEnum, photos, trips } from "@/db/schema";
import { fail, ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * `tripId` is optional: photos for a car going out are taken before the trip
 * row exists, so they are stored loose and attached when the trip is saved.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  const form = await req.formData();

  const file = form.get("file");
  const tripId = String(form.get("tripId") ?? "").trim();
  const angle = String(form.get("angle") ?? "OTHER");
  const caption = String(form.get("caption") ?? "").trim();

  if (!(file instanceof File)) return fail("ไม่พบไฟล์รูป");
  if (!ALLOWED.includes(file.type)) return fail("รองรับเฉพาะไฟล์ JPEG, PNG หรือ WebP");
  if (file.size > MAX_BYTES) return fail("ไฟล์ใหญ่เกิน 4MB กรุณาถ่ายใหม่");
  if (!photoAngleEnum.enumValues.includes(angle as never)) return fail("มุมรูปไม่ถูกต้อง");

  if (tripId) {
    const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
    if (!trip) return fail("ไม่พบรายการ", 404);
    const allowed =
      trip.driverId === user.id ||
      user.roles.includes("FLEET_MANAGER") ||
      user.roles.includes("ADMIN");
    if (!allowed) return fail("คุณไม่มีสิทธิ์อัปโหลดรูปของรายการนี้", 403);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");

  const photoId = await db.transaction(async (tx) => {
    const [f] = await tx
      .insert(files)
      .values({
        storage: "db",
        mimeType: file.type,
        fileSize: buffer.byteLength,
        checksum,
        data: buffer,
        uploadedBy: user.id,
      })
      .returning({ id: files.id });

    const [p] = await tx
      .insert(photos)
      .values({
        fileId: f.id,
        tripId: tripId || null,
        angle: angle as never,
        caption: caption || null,
        capturedAt: new Date(),
        uploadedBy: user.id,
      })
      .returning({ id: photos.id });

    return p.id;
  });

  return ok({ id: photoId, angle, url: `/api/photos/${photoId}` }, 201);
});
