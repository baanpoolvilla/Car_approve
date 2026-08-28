import { desc } from "drizzle-orm";
import { db } from "@/db";
import { termsVersions } from "@/db/schema";
import { requireUserPage } from "@/lib/auth";
import { fmtDateTime } from "@/lib/datetime";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TermsPage() {
  await requireUserPage();
  const rows = await db
    .select()
    .from(termsVersions)
    .orderBy(desc(termsVersions.effectiveAt))
    .limit(10);

  const active = rows.find((r) => r.isActive) ?? rows[0];

  return (
    <div>
      <PageHeader
        title="เงื่อนไขการใช้รถ"
        subtitle={active ? `ฉบับ ${active.version} · มีผล ${fmtDateTime(active.effectiveAt)}` : undefined}
      />
      {!active ? (
        <EmptyState text="ยังไม่ได้กำหนดเงื่อนไข" />
      ) : (
        <article className="card whitespace-pre-wrap text-sm leading-7 text-slate-700">
          {active.content}
        </article>
      )}
    </div>
  );
}
