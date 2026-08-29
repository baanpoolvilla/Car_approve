import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files, photos, trips } from "@/db/schema";
import { fail, ok, route } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadPhoto(id: string) {
  const rows = await db
    .select({
      photoId: photos.id,
      tripId: photos.tripId,
      tripStatus: trips.status,
      driverId: trips.driverId,
      uploadedBy: photos.uploadedBy,
      mimeType: files.mimeType,
      data: files.data,
      fileId: files.id,
    })
    .from(photos)
    .innerJoin(files, eq(files.id, photos.fileId))
    .leftJoin(trips, eq(trips.id, photos.tripId))
    .where(eq(photos.id, id))
    .limit(1);
  return rows[0];
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    // Any signed-in staff member may view fleet photos; anonymous access is denied.
    await requireUser();
    const { id } = await ctx.params;
    const row = await loadPhoto(id);
    if (!row?.data) return fail("ไม่พบรูป", 404);

    return new Response(new Uint8Array(row.data), {
      headers: {
        "Content-Type": row.mimeType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Disposition": "inline",
      },
    });
  })(req);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const row = await loadPhoto(id);
    if (!row) return fail("ไม่พบรูป", 404);

    // Once a trip is closed its photos are the record — they stay.
    if (row.tripId && row.tripStatus !== "IN_USE") {
      return fail("รายการนี้ปิดแล้ว ลบรูปไม่ได้", 400);
    }

    const owner =
      row.uploadedBy === user.id ||
      row.driverId === user.id ||
      user.roles.includes("FLEET_MANAGER") ||
      user.roles.includes("ADMIN");
    if (!owner) return fail("คุณไม่มีสิทธิ์ลบรูปนี้", 403);

    await db.transaction(async (tx) => {
      await tx.delete(photos).where(eq(photos.id, id));
      await tx.delete(files).where(eq(files.id, row.fileId));
    });
    return ok({ ok: true });
  })(req);
}
