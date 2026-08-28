import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { userRoles, users } from "@/db/schema";
import { requireRolePage } from "@/lib/auth";
import { BackLink, PageHeader } from "@/components/ui";
import UsersAdmin from "./UsersAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireRolePage("ADMIN");

  const [rows, roles] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db.select().from(userRoles),
  ]);

  const list = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    department: u.department,
    isActive: u.isActive,
    roles: roles.filter((r) => r.userId === u.id).map((r) => r.role),
  }));

  return (
    <div>
      <BackLink href="/more" label="เมนู" />
      <PageHeader title="ผู้ใช้และสิทธิ์" subtitle={`${list.length} คน`} />
      <UsersAdmin users={list} />
    </div>
  );
}
