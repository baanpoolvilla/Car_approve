import { eq } from "drizzle-orm";
import { db } from "@/db";
import { termsVersions } from "@/db/schema";
import { requireUserPage } from "@/lib/auth";
import { BackLink, PageHeader } from "@/components/ui";
import NewRequestForm from "./NewRequestForm";

export const dynamic = "force-dynamic";

export default async function NewRequestPage() {
  await requireUserPage();
  const terms = await db.query.termsVersions.findFirst({
    where: eq(termsVersions.isActive, true),
  });

  return (
    <div>
      <BackLink href="/" label="หน้าหลัก" />
      <PageHeader title="ขอใช้รถ" subtitle="เลือกช่วงเวลาแล้วตรวจรถที่ว่าง" />
      <NewRequestForm
        termsVersion={terms?.version ?? null}
        termsContent={terms?.content ?? null}
      />
    </div>
  );
}
