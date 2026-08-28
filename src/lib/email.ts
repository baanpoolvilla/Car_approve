import "server-only";

const FROM = process.env.EMAIL_FROM ?? "Car Approve <onboarding@resend.dev>";
const KEY = process.env.RESEND_API_KEY;

export type Mail = { to: string; subject: string; html: string; text?: string };

/**
 * Sends through Resend when RESEND_API_KEY is configured; otherwise logs the
 * message so the app stays usable before the mail provider is wired up.
 */
export async function sendEmail(mail: Mail): Promise<{ sent: boolean; error?: string }> {
  if (!KEY) {
    console.log(`[email:dev] to=${mail.to} subject=${mail.subject}\n${mail.text ?? mail.html}`);
    return { sent: false, error: "RESEND_API_KEY not configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email] resend failed", res.status, body);
      return { sent: false, error: `resend ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] error", err);
    return { sent: false, error: String(err) };
  }
}

export function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f4f5f7;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb">
    <h2 style="margin:0 0 12px;font-size:18px;color:#111827">${title}</h2>
    <div style="font-size:14px;line-height:1.7;color:#374151">${bodyHtml}</div>
    ${
      cta
        ? `<p style="margin-top:20px"><a href="${cta.url}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">${cta.label}</a></p>`
        : ""
    }
    <p style="margin-top:24px;font-size:12px;color:#9ca3af">ระบบบันทึกการใช้รถบริษัท</p>
  </div>
</div>`;
}

export function appUrl(path = "") {
  const base =
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  return `${base.replace(/\/$/, "")}${path}`;
}
