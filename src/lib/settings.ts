import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import type { PhotoAngle } from "@/db/schema";

export const DEFAULT_REQUIRED_ANGLES: PhotoAngle[] = [
  "FRONT",
  "REAR",
  "LEFT",
  "RIGHT",
  "INTERIOR",
  "ODOMETER",
];

export const ANGLE_LABEL: Record<PhotoAngle, string> = {
  FRONT: "หน้ารถ",
  REAR: "ท้ายรถ",
  LEFT: "ด้านซ้าย",
  RIGHT: "ด้านขวา",
  INTERIOR: "ภายในรถ",
  ODOMETER: "เลขไมล์",
  DAMAGE: "จุดเสียหาย",
  OTHER: "อื่น ๆ",
};

export async function getRequiredAngles(): Promise<PhotoAngle[]> {
  const row = await db.query.settings.findFirst({
    where: eq(settings.key, "required_photo_angles"),
  });
  const value = row?.value as unknown;
  if (Array.isArray(value) && value.length > 0) return value as PhotoAngle[];
  return DEFAULT_REQUIRED_ANGLES;
}

export async function setSetting(key: string, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value: value as never })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as never, updatedAt: new Date() },
    });
}
