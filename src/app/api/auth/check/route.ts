import { body, ok, route } from "@/lib/api";
import { checkEmail } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const { email } = await body<{ email?: string }>(req);
  if (!email?.trim()) return ok({ error: "กรุณากรอกอีเมล" }, 400);
  return ok(await checkEmail(email));
});
