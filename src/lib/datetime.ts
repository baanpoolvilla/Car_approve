export const TZ = "Asia/Bangkok";

const dateTimeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "-";
  return dateTimeFmt.format(new Date(d)) + " น.";
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "-";
  return dateFmt.format(new Date(d));
}

export function fmtTime(d: Date | string | null | undefined) {
  if (!d) return "-";
  return timeFmt.format(new Date(d)) + " น.";
}

export function fmtRange(a: Date | string, b: Date | string) {
  const da = new Date(a);
  const db = new Date(b);
  const sameDay = dateFmt.format(da) === dateFmt.format(db);
  return sameDay
    ? `${dateFmt.format(da)} ${timeFmt.format(da)}–${timeFmt.format(db)} น.`
    : `${fmtDateTime(da)} – ${fmtDateTime(db)}`;
}

/** Value for <input type="datetime-local"> rendered in Bangkok time. */
export function toLocalInput(d: Date | string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(d));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Interpret a `YYYY-MM-DDTHH:mm` string as Bangkok wall-clock time (UTC+7)
 * and return the corresponding absolute instant.
 */
export function fromBangkokInput(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) throw new Error("รูปแบบวันเวลาไม่ถูกต้อง");
  const [, y, mo, d, h, mi] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:00+07:00`);
}

export function durationText(a: Date | string, b: Date | string) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}
