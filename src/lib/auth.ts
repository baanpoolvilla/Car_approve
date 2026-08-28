import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginCodes, sessions, userRoles, users } from "@/db/schema";
import type { RoleCode } from "@/db/schema";

export const SESSION_COOKIE = "car_session";
const SESSION_DAYS = 14;
const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

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

async function clientMeta() {
  const h = await headers();
  return {
    ip:
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null,
    userAgent: h.get("user-agent") ?? null,
  };
}

/* ------------------------------------------------------------ login flow */

export async function requestLoginCode(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  const user = await db.query.users.findFirst({ where: eq(users.email, email) });

  // Always behave the same way so the endpoint cannot be used to enumerate staff.
  if (!user || !user.isActive) return { ok: true as const, code: null };

  const recent = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginCodes)
    .where(
      and(
        eq(loginCodes.email, email),
        gt(loginCodes.createdAt, new Date(Date.now() - 15 * 60_000))
      )
    );
  if ((recent[0]?.n ?? 0) >= 5) {
    throw new Error("ขอรหัสถี่เกินไป กรุณารอสักครู่แล้วลองใหม่");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(loginCodes).values({
    email,
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
  });

  return { ok: true as const, code, user };
}

export async function verifyLoginCode(rawEmail: string, rawCode: string) {
  const email = rawEmail.trim().toLowerCase();
  const code = rawCode.trim();

  const record = await db.query.loginCodes.findFirst({
    where: and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt)),
    orderBy: [desc(loginCodes.createdAt)],
  });

  if (!record) throw new Error("ไม่พบรหัสยืนยัน กรุณาขอรหัสใหม่");
  if (record.expiresAt.getTime() < Date.now()) throw new Error("รหัสหมดอายุแล้ว กรุณาขอรหัสใหม่");
  if (record.attempts >= MAX_CODE_ATTEMPTS) throw new Error("กรอกรหัสผิดหลายครั้ง กรุณาขอรหัสใหม่");

  const a = Buffer.from(sha256(code));
  const b = Buffer.from(record.codeHash);
  const match = a.length === b.length && timingSafeEqual(a, b);

  if (!match) {
    await db
      .update(loginCodes)
      .set({ attempts: record.attempts + 1 })
      .where(eq(loginCodes.id, record.id));
    throw new Error("รหัสยืนยันไม่ถูกต้อง");
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user || !user.isActive) throw new Error("บัญชีนี้ถูกปิดการใช้งาน");

  await db
    .update(loginCodes)
    .set({ consumedAt: new Date() })
    .where(eq(loginCodes.id, record.id));

  await createSession(user.id);
  return user;
}

export async function createSession(userId: string) {
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
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
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
