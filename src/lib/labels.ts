import type { RequestStatus } from "@/db/schema";

export const STATUS_LABEL_MAP: Record<RequestStatus, string> = {
  DRAFT: "ร่าง",
  PENDING_APPROVAL: "รออนุมัติ",
  APPROVED: "อนุมัติแล้ว",
  REJECTED: "ไม่อนุมัติ",
  CHECKED_OUT: "กำลังใช้งาน",
  RETURNED: "คืนรถแล้ว รอตรวจ",
  COMPLETED: "เสร็จสิ้น",
  CANCELLED: "ยกเลิก",
  EXPIRED: "หมดอายุ",
};
