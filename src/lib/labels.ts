import type { TripStatus } from "@/db/schema";

export const STATUS_LABEL_MAP: Record<TripStatus, string> = {
  IN_USE: "กำลังใช้งาน",
  COMPLETED: "คืนรถแล้ว",
  CANCELLED: "ยกเลิก",
};
