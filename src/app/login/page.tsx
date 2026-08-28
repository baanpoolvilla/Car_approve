import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-2xl">
            🚗
          </div>
          <h1 className="text-lg font-bold text-slate-900">ระบบบันทึกการใช้รถบริษัท</h1>
          <p className="mt-1 text-sm text-slate-500">เข้าสู่ระบบด้วยอีเมลบริษัท</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
