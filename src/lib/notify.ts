import "server-only";
import { inArray } from "drizzle-orm";
import { db, type DbLike } from "@/db";
import { notifications, users } from "@/db/schema";
import { appUrl, layout, sendEmail } from "./email";

export type NotifyInput = {
  userIds: string[];
  type: string;
  title: string;
  body?: string;
  link?: string;
};

/**
 * Writes the in-app notification inside the caller's transaction and returns a
 * callback that delivers the emails *after* the transaction has committed, so a
 * slow mail provider never holds a database transaction open.
 */
export async function queueNotification(tx: DbLike, input: NotifyInput) {
  if (input.userIds.length === 0) return async () => {};

  await tx.insert(notifications).values(
    input.userIds.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    }))
  );

  return async () => {
    try {
      const recipients = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(inArray(users.id, input.userIds));

      await Promise.all(
        recipients.map((r) =>
          sendEmail({
            to: r.email,
            subject: input.title,
            text: `${input.title}\n\n${input.body ?? ""}\n\n${appUrl(input.link ?? "/")}`,
            html: layout(
              input.title,
              `<p>เรียน ${r.name}</p><p>${(input.body ?? "").replace(/\n/g, "<br>")}</p>`,
              input.link ? { label: "เปิดในระบบ", url: appUrl(input.link) } : undefined
            ),
          })
        )
      );
    } catch (err) {
      console.error("[notify] delivery failed", err);
    }
  };
}

export async function notifyNow(input: NotifyInput) {
  const deliver = await queueNotification(db, input);
  await deliver();
}
