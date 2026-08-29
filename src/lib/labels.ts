import type { TripStatus } from "@/db/schema";

export const STATUS_LABEL_MAP: Record<TripStatus, string> = {
  IN_USE: "กำลังใช้งาน",
  COMPLETED: "คืนรถแล้ว",
  CANCELLED: "ยกเลิก",
};

export type PowerWords = {
  level: string;
  short: string;
  low: string;
  marks: [string, string, string];
};

/** คำที่ใช้เรียก "พลังงานคงเหลือ" ต่างกันระหว่างรถไฟฟ้ากับรถน้ำมัน */
export function powerWords(powerType: "EV" | "FUEL"): PowerWords {
  return powerType === "FUEL"
    ? {
        level: "ระดับน้ำมัน",
        short: "น้ำมัน",
        low: "น้ำมันน้อยกว่าตอนรับรถ ควรเติมก่อนคืน",
        marks: ["E", "1/2", "F"],
      }
    : {
        level: "ระดับแบตเตอรี่",
        short: "แบตเตอรี่",
        low: "แบตเตอรี่น้อยกว่าตอนรับรถ ควรชาร์จก่อนคืน",
        marks: ["0%", "50%", "100%"],
      };
}

export const POWER_TYPE_LABEL: Record<string, string> = {
  EV: "ไฟฟ้า",
  FUEL: "น้ำมัน",
};
