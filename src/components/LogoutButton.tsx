"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className={className ?? "btn-secondary w-full"}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      {busy ? "กำลังออก..." : "ออกจากระบบ"}
    </button>
  );
}
