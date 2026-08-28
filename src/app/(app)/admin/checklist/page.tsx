import { asc } from "drizzle-orm";
import { db } from "@/db";
import { checklistDefinitions, photoAngleEnum } from "@/db/schema";
import { requireRolePage } from "@/lib/auth";
import { ANGLE_LABEL, getRequiredAngles } from "@/lib/settings";
import { BackLink, PageHeader } from "@/components/ui";
import ChecklistAdmin from "./ChecklistAdmin";

export const dynamic = "force-dynamic";

export default async function AdminChecklistPage() {
  await requireRolePage("ADMIN");

  const [rows, required] = await Promise.all([
    db.select().from(checklistDefinitions).orderBy(asc(checklistDefinitions.sortOrder)),
    getRequiredAngles(),
  ]);

  return (
    <div>
      <BackLink href="/more" label="เมนู" />
      <PageHeader title="Checklist และรูปบังคับ" subtitle="ใช้ทั้งตอนรับรถและคืนรถ" />
      <ChecklistAdmin
        items={rows.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          category: r.category,
          isRequired: r.isRequired,
          isActive: r.isActive,
        }))}
        allAngles={photoAngleEnum.enumValues.map((a) => ({ code: a, label: ANGLE_LABEL[a] ?? a }))}
        requiredAngles={required}
      />
    </div>
  );
}
