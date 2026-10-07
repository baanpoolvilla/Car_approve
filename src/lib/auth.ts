import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, userRoles, users } from "@/db/schema";
import type { RoleCode } from "@/db/schema";

export const SESSION_COOKIE = "car_session";
const SESSION_DAYS = 14;
const MAX_PIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  department: string | null;
  roles: RoleCode[];
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/* ------------------------------------------------------------- PIN hashing */

/** scrypt with a per-user salt, stored as `salt:hash`. */
function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPin(pin: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const derived = scryptSync(pin, salt, 64);
  const expectedBuf = Buffer.from(expected, "hex");
  return derived.length === expectedBuf.length && timingSafeEqual(derived, expectedBuf);
}

/** Rejects PINs that are trivially guessable. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return "รหัสต้องเป็นตัวเลข 6 หลัก";
  if (/^(\d)\1{5}$/.test(pin)) return "รหัสซ้ำกันทั้ง 6 ตัวใช้ไม่ได้ กรุณาตั้งรหัสอื่น";
  const digits = pin.split("").map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);
  if (ascending || descending) return "รหัสเรียงตัวเลขติดกันใช้ไม่ได้ กรุณาตั้งรหัสอื่น";
  return null;
}

async function clientMeta() {
  const h = await headers();
  return {
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null,
    userAgent: h.get("user-agent") ?? null,
  };
}

/* ------------------------------------------------------------- login flow */

export class LoginError extends Error {
  status = 400;
}

async function findActiveUser(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) throw new LoginError("ไม่พบอีเมลนี้ในระบบ กรุณาติดต่อผู้ดูแลระบบ");
  if (!user.isActive) throw new LoginError("บัญชีนี้ถูกปิดการใช้งาน");
  return user;
}

function assertNotLocked(lockedUntil: Date | null) {
  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000);
    throw new LoginError(`กรอกรหัสผิดหลายครั้ง บัญชีถูกล็อกอีก ${mins} นาที`);
  }
}

/** Step 1: does this person already have a PIN, or do they need to set one? */
export async function checkEmail(rawEmail: string) {
  const user = await findActiveUser(rawEmail);
  assertNotLocked(user.lockedUntil);
  return { name: user.name, hasPin: Boolean(user.pinHash) };
}

/** Step 2a: first-time setup — the person chooses their own PIN. */
export async function setPin(rawEmail: string, pin: string, confirmPin: string) {
  const user = await findActiveUser(rawEmail);
  if (user.pinHash) throw new LoginError("บัญชีนี้ตั้งรหัสไว้แล้ว กรุณาเข้าสู่ระบบด้วยรหัสเดิม");
  if (pin !== confirmPin) throw new LoginError("รหัสทั้งสองช่องไม่ตรงกัน");

  const problem = pinProblem(pin);
  if (problem) throw new LoginError(problem);

  await db
    .update(users)
    .set({
      pinHash: hashPin(pin),
      pinSetAt: new Date(),
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  await createSession(user.id);
  return user;
}

/** Step 2b: normal login with the PIN the person set. */
export async function loginWithPin(rawEmail: string, pin: string) {
  const user = await findActiveUser(rawEmail);
  assertNotLocked(user.lockedUntil);
  if (!user.pinHash) throw new LoginError("ยังไม่ได้ตั้งรหัส กรุณาตั้งรหัสก่อนเข้าใช้งาน");

  if (!verifyPin(pin, user.pinHash)) {
    const attempts = user.failedAttempts + 1;
    const lock = attempts >= MAX_PIN_ATTEMPTS;
    await db
      .update(users)
      .set({
        failedAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
      })
      .where(eq(users.id, user.id));

    throw new LoginError(
      lock
        ? `กรอกรหัสผิด ${MAX_PIN_ATTEMPTS} ครั้ง บัญชีถูกล็อก ${LOCK_MINUTES} นาที`
        : `รหัสไม่ถูกต้อง (เหลืออีก ${MAX_PIN_ATTEMPTS - attempts} ครั้ง)`
    );
  }

  if (user.failedAttempts !== 0 || user.lockedUntil) {
    await db
      .update(users)
      .set({ failedAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
  }

  await createSession(user.id);
  return user;
}

/**
 * เข้าสู่ระบบจาก SmartBoss (SSO) — ตัวตนยืนยันมาแล้วด้วย token ที่ SmartBoss เซ็น (ดู app/sso/route.ts)
 * จึงไม่ถามรหัส 6 หลัก · **ไม่สร้างบัญชีให้เอง**: ต้องเป็นอีเมลที่ผู้ดูแลระบบเพิ่มไว้แล้วและยังเปิดใช้งาน
 * (กติกาเดิมของระบบนี้ — SmartBoss มีหลายบริษัท คนที่ล็อกอิน SmartBoss ได้ไม่ได้แปลว่าใช้รถบริษัทนี้ได้)
 * คืน null เมื่อไม่มีบัญชี/ถูกปิด
 */
export async function loginWithSso(rawEmail: string, opts: { embed: boolean }) {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return null;
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !user.isActive) return null;
  await createSession(user.id, { embed: opts.embed });
  return user;
}

/** Change your own PIN from inside the app. */
export async function changePin(userId: string, currentPin: string, newPin: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.pinHash) throw new LoginError("ไม่พบข้อมูลผู้ใช้");
  if (!verifyPin(currentPin, user.pinHash)) throw new LoginError("รหัสเดิมไม่ถูกต้อง");

  const problem = pinProblem(newPin);
  if (problem) throw new LoginError(problem);

  await db
    .update(users)
    .set({ pinHash: hashPin(newPin), pinSetAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Admin action: clear a PIN so the person can set a new one. */
export async function clearPin(userId: string) {
  await db
    .update(users)
    .set({ pinHash: null, pinSetAt: null, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(users.id, userId));

  // Signing them out everywhere stops a stolen session outliving the reset.
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.userId, userId));
}

/* -------------------------------------------------------------- sessions */

/**
 * `embed` = เปิดอยู่ในกรอบ (iframe) ข้างใน SmartBoss — cookie แบบปกติ (SameSite=Lax) เบราว์เซอร์ไม่ส่งให้
 * เว็บที่อยู่ในกรอบของอีกเว็บ ล็อกอินผ่านแล้วหน้าถัดไปก็ไม่เห็น cookie เด้งกลับหน้า login วนไป
 * (เจอจริงบน iPhone) ⇒ ในกรอบใช้ SameSite=None; Secure; Partitioned: cookie ผูกกับ "เว็บรถที่อยู่ใน
 * SmartBoss" เท่านั้น เว็บอื่นเอาไปใช้ไม่ได้ · เปิดเว็บรถตรง ๆ ยังใช้ cookie แบบ Lax ตามเดิม
 */
export async function createSession(userId: string, opts: { embed?: boolean } = {}) {
  const token = randomBytes(32).toString("base64url");
  const meta = await clientMeta();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt,
    ipAddress: meta.ip,
    userAgent: meta.userAgent,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    expires: expiresAt,
    ...(opts.embed
      ? { sameSite: "none" as const, secure: true, partitioned: true }
      : { sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" }),
  });
  return token;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/* --------------------------------------------------------- current user */

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      department: users.department,
      isActive: users.isActive,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);

  const row = rows[0];
  if (!row || row.revokedAt || !row.isActive) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  const roleRows = await db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, row.id));

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    department: row.department,
    roles: roleRows.map((r) => r.role),
  };
});

/* ----------------------------------------------------------------- rbac */

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("กรุณาเข้าสู่ระบบ", 401);
  return user;
}

export function hasRole(user: SessionUser, ...roles: RoleCode[]) {
  return roles.some((r) => user.roles.includes(r));
}

export async function requireRole(...roles: RoleCode[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user, ...roles, "ADMIN")) {
    throw new AuthError("คุณไม่มีสิทธิ์เข้าถึงส่วนนี้");
  }
  return user;
}

export const isAdmin = (u: SessionUser) => u.roles.includes("ADMIN");
export const isApprover = (u: SessionUser) => u.roles.includes("APPROVER");
export const isFleet = (u: SessionUser) =>
  u.roles.includes("FLEET_MANAGER") || u.roles.includes("ADMIN");
export const isAuditor = (u: SessionUser) =>
  u.roles.includes("AUDITOR") || u.roles.includes("ADMIN");

/**
 * Page-level guards. Server components cannot show a thrown AuthError nicely,
 * so unauthorised visitors are redirected instead.
 */
export async function requireUserPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRolePage(...roles: RoleCode[]): Promise<SessionUser> {
  const user = await requireUserPage();
  if (!hasRole(user, ...roles, "ADMIN")) redirect("/?denied=1");
  return user;
}
