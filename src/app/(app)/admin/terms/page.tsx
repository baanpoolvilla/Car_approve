import { desc } from "drizzle-orm";
import { db } from "@/db";
import { termsVersions } from "@/db/schema";
import { requireRolePage } from "@/lib/auth";
import { fmtDateTime } from "@/lib/datetime";
import { BackLink, PageHeader } from "@/components/ui";
import TermsAdmin from "./TermsAdmin";

export const dynamic = "force-dynamic";

export default async function AdminTermsPage() {
  await requireRolePage("ADMIN");
  const rows = await db.select().from(termsVersions).orderBy(desc(termsVersions.effectiveAt));

  return (
    <div>
      <BackLink href="/more" label="เมนู" />
      <PageHeader title="เงื่อนไขการใช้รถ" subtitle="เผยแพร่เวอร์ชันใหม่โดยไม่ลบของเดิม" />
      <TermsAdmin
        current={rows.find((r) => r.isActive)?.content ?? ""}
        versions={rows.map((r) => ({
          id: r.id,
          version: r.version,
          isActive: r.isActive,
          effectiveAt: fmtDateTime(r.effectiveAt),
        }))}
      />
    </div>
  );
}
