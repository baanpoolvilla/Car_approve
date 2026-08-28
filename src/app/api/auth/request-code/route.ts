import { body, ok, route } from "@/lib/api";
import { requestLoginCode } from "@/lib/auth";
import { layout, sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { email } = await body<{ email?: string }>(req);
  if (!email?.trim()) return ok({ error: "กรุณากรอกอีเมล" }, 400);

  const result = await requestLoginCode(email);

  // No matching account: respond identically so emails cannot be enumerated.
  if (!result.code) return ok({ ok: true });

  const sent = await sendEmail({
    to: email.trim().toLowerCase(),
    subject: `รหัสเข้าสู่ระบบ ${result.code}`,
    text: `รหัสเข้าสู่ระบบของคุณคือ ${result.code} (หมดอายุใน 10 นาที)`,
    html: layout(
      "รหัสเข้าสู่ระบบ",
      `<p>รหัสเข้าสู่ระบบของคุณคือ</p>
       <p style="font-size:30px;letter-spacing:8px;font-weight:700;color:#1d4ed8">${result.code}</p>
       <p>รหัสนี้ใช้ได้ภายใน 10 นาที หากคุณไม่ได้เป็นผู้ขอ กรุณาเพิกเฉยต่ออีเมลฉบับนี้</p>`
    ),
  });

  // Without a mail provider the code is surfaced in the UI so the app still works.
  return ok({ ok: true, devCode: sent.sent ? undefined : result.code });
});
