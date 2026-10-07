import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

/** เหตุผลที่เข้าจาก SmartBoss (app/sso/route.ts) ไม่สำเร็จ — บอกให้รู้ว่าต้องทำอะไรต่อ */
const SSO_NOTICE: Record<string, string> = {
  unknown:
    "อีเมลของคุณใน SmartBoss ยังไม่มีในระบบใช้รถ (หรือถูกปิดใช้งาน) — แจ้งผู้ดูแลระบบให้เพิ่มอีเมลนี้ก่อน แล้วเปิดจาก SmartBoss อีกครั้ง",
  invalid: "ลิงก์เข้าสู่ระบบจาก SmartBoss หมดอายุหรือไม่ถูกต้อง — กลับไปกดเปิดจาก SmartBoss อีกครั้ง",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sso?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const notice = SSO_NOTICE[(await searchParams).sso ?? ""];

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-2xl">
            🚗
          </div>
          <h1 className="text-lg font-bold text-slate-900">ระบบบันทึกการใช้รถบริษัท</h1>
          <p className="mt-1 text-sm text-slate-500">เข้าสู่ระบบด้วยอีเมลและรหัส 6 หลัก</p>
        </div>
        {notice && (
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</div>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
