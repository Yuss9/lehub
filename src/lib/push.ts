import webpush from "web-push";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { db as productionDb } from "@/db";
import { pushSubscription, reminderPreference, membership } from "@/db/schema";
import { requireMembership } from "./domain";
type Database = typeof productionDb;
export const pushConfigured = () =>
  Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT,
  );
// Restrict outbound requests to browser push providers, never arbitrary URLs supplied by a client.
export const subscriptionSchema = z.object({
  endpoint: z
    .url()
    .max(2048)
    .refine((raw) => {
      const url = new URL(raw);
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        !url.hash &&
        [
          "fcm.googleapis.com",
          "updates.push.services.mozilla.com",
          "web.push.apple.com",
        ].includes(url.hostname)
      );
    }, "Service push non pris en charge."),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]{87}$/)
      .refine((s) => Buffer.from(s, "base64url").length === 65),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]{22}$/)
      .refine((s) => Buffer.from(s, "base64url").length === 16),
  }),
});
export async function subscribePush(
  database: Database,
  actor: string,
  home: string,
  raw: unknown,
) {
  await requireMembership(database, actor, home);
  const data = subscriptionSchema.parse(raw);
  await database.transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(membership)
      .where(
        and(eq(membership.householdId, home), eq(membership.userId, actor)),
      )
      .for("update");
    if (!member) throw Error("Accès retiré");
    await tx
      .insert(pushSubscription)
      .values({
        id: randomUUID(),
        userId: actor,
        householdId: home,
        endpoint: data.endpoint,
        ...data.keys,
      })
      .onConflictDoUpdate({
        target: [
          pushSubscription.householdId,
          pushSubscription.userId,
          pushSubscription.endpoint,
        ],
        set: data.keys,
      });
    await tx
      .insert(reminderPreference)
      .values({ userId: actor, householdId: home, pushEnabled: true })
      .onConflictDoUpdate({
        target: [reminderPreference.householdId, reminderPreference.userId],
        set: { pushEnabled: true },
      });
  });
}
export async function sendPush(
  database: Database,
  actor: string,
  home: string,
) {
  if (!pushConfigured()) throw Error("Push non configuré");
  const subscriptions = await database
    .select()
    .from(pushSubscription)
    .where(
      and(
        eq(pushSubscription.userId, actor),
        eq(pushSubscription.householdId, home),
      ),
    );
  if (!subscriptions.length) throw Error("Aucun appareil inscrit");
  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({
          title: "lehub",
          body: "Une échéance du foyer demande ton attention. Ouvre lehub pour la consulter.",
          url: "/settings",
        }),
        {
          vapidDetails: {
            subject: process.env.VAPID_SUBJECT!,
            publicKey: process.env.VAPID_PUBLIC_KEY!,
            privateKey: process.env.VAPID_PRIVATE_KEY!,
          },
          TTL: 86400,
          timeout: 10000,
        },
      );
      sent++;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410)
        await database
          .delete(pushSubscription)
          .where(eq(pushSubscription.id, subscription.id));
      // One expired device must not prevent delivery to another device.
    }
  }
  if (!sent) throw Error("Aucune notification distribuée");
}

export async function unsubscribePush(
  database: Database,
  actor: string,
  home: string,
  endpoint: string,
) {
  await requireMembership(database, actor, home);
  await database.transaction(async (tx) => {
    const [member] = await tx
      .select()
      .from(membership)
      .where(
        and(eq(membership.householdId, home), eq(membership.userId, actor)),
      )
      .for("update");
    if (!member) throw Error("Accès retiré");
    await tx
      .delete(pushSubscription)
      .where(
        and(
          eq(pushSubscription.householdId, home),
          eq(pushSubscription.userId, actor),
          eq(pushSubscription.endpoint, endpoint),
        ),
      );
    const remaining = await tx
      .select()
      .from(pushSubscription)
      .where(
        and(
          eq(pushSubscription.householdId, home),
          eq(pushSubscription.userId, actor),
        ),
      )
      .limit(1);
    if (!remaining.length)
      await tx
        .update(reminderPreference)
        .set({ pushEnabled: false })
        .where(
          and(
            eq(reminderPreference.householdId, home),
            eq(reminderPreference.userId, actor),
          ),
        );
  });
}
