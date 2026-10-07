import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser, loginWithSso } from "@/lib/auth";
import { logAuditStandalone } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * รับการเข้าสู่ระบบจาก SmartBoss — กดไอคอน "ใช้รถบริษัท" ใน SmartBoss แล้วเข้าได้เลยไม่ต้องกรอกรหัสซ้ำ
 *
 * SmartBoss เปิด `/sso?token=<JWT>&embed=1` (embed=1 เมื่อเปิดในกรอบข้างใน SmartBoss)
 * token: JWT HS256 เซ็นด้วย secret ร่วม (env `SSO_SECRET` ที่นี่ = `SSO_CARAPPROVE_SECRET` ฝั่ง SmartBoss)
 * อายุ 60 วินาที · iss = "smartboss" · aud = "carapprove" · claims: sub, name, email, isAdmin
 *
 * ผ่าน → ออก session ของระบบนี้ตามปกติ แล้วไปหน้าแรก · ไม่ผ่าน/ไม่มีบัญชี → หน้า login พร้อมเหตุผล
 * ยังไม่ตั้ง SSO_SECRET = ปิดทางนี้ (ไปหน้า login เฉย ๆ) — ไม่มี secret ห้ามเชื่อ token ใด ๆ
 *
 * ⚠ สิทธิ์ (ADMIN ฯลฯ) ยังมาจากตาราง user_roles ของระบบนี้เท่านั้น — ไม่เชื่อ `isAdmin` จาก token
 */

interface SsoClaims {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  email?: string;
  name?: string;
}

function verify(token: string, secret: string): SsoClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  try {
    const head = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: string };
    if (head.alg !== "HS256") return null;

    const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SsoClaims;
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (claims.iss !== "smartboss" || !audiences.includes("carapprove")) return null;
    if (typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const embed = url.searchParams.get("embed") === "1";
  const to = (path: string) => {
    const res = NextResponse.redirect(new URL(path, url));
    // token อยู่ใน query — ไม่ให้ติดไปกับ Referer หรือถูกเก็บใน cache
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  };

  const secret = process.env.SSO_SECRET;
  if (!secret) return to("/login");

  const claims = verify(url.searchParams.get("token") ?? "", secret);
  const email = claims?.email?.trim().toLowerCase();
  if (!claims || !email) return to("/login?sso=invalid");

  // เปิดซ้ำทั้งที่ล็อกอินคนเดิมอยู่แล้ว — ไม่ต้องออก session ใหม่ทุกครั้งที่กดไอคอน
  const current = await getCurrentUser();
  if (current?.email === email) return to("/");

  const user = await loginWithSso(email, { embed });
  if (!user) return to("/login?sso=unknown");

  await logAuditStandalone({
    actor: { id: user.id, email: user.email, name: user.name, department: null, roles: [] },
    entityType: "session",
    entityId: user.id,
    action: "LOGIN_SSO",
  });
  return to("/");
}
