import webpush from "web-push";
import { z } from "zod";
import { and, eq, gt, sql } from "drizzle-orm";
import { randomUUID, createHash } from "node:crypto";
import type { db as productionDb } from "@/db";
import { pushSubscription, reminderPreference, membership, session, pushReceipt } from "@/db/schema";
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
  sessionId: string,
  label = "Navigateur",
) {
  await requireMembership(database, actor, home);
  const data = subscriptionSchema.parse(raw);
  await database.transaction(async (tx) => {
    const [activeSession] = await tx.select().from(session).where(and(eq(session.id, sessionId), eq(session.userId, actor), gt(session.expiresAt, new Date()))).for("share");
    if (!activeSession) throw Error("Session expirée");
    // Serialize ownership transfers for a browser endpoint across accounts.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${data.endpoint}))`);
    await tx.delete(pushSubscription).where(and(eq(pushSubscription.endpoint, data.endpoint), sql`${pushSubscription.userId} <> ${actor}`));
    await tx.update(pushSubscription).set({ sessionId, label: label.slice(0, 120) }).where(and(eq(pushSubscription.endpoint, data.endpoint), eq(pushSubscription.userId, actor)));
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
        sessionId,
        label: label.slice(0, 120),
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
        set: { ...data.keys, sessionId, label: label.slice(0, 120) },
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
  deliveryId?: string,
) {
  const error = await database.transaction(async (tx) => {
    if (!pushConfigured()) throw Error("Push non configuré");
    const subscriptions = await tx
      .select({ subscription: pushSubscription })
      .from(pushSubscription)
      .innerJoin(session, and(eq(session.id, pushSubscription.sessionId), gt(session.expiresAt, new Date())))
      .where(
        and(
          eq(pushSubscription.userId, actor),
          eq(pushSubscription.householdId, home),
        ),
      ).orderBy(pushSubscription.id).for("share", { of: [session, pushSubscription] });
    if (!subscriptions.length) return "Aucun appareil inscrit";
    let sent = 0;
    let failed = false;
    for (const { subscription } of subscriptions) {
      const deviceKey = createHash("sha256").update(subscription.endpoint).digest("hex");
      if (deliveryId) {
        const [receipt] = await tx.select().from(pushReceipt).where(and(eq(pushReceipt.deliveryId, deliveryId), eq(pushReceipt.deviceKey, deviceKey)));
        if (receipt?.status === "sent" || receipt?.status === "expired") { sent++; continue; }
      }
      let status = "sent", lastError = "";
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
        const code = (error as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410)
          await tx
            .delete(pushSubscription)
            .where(eq(pushSubscription.id, subscription.id));
        status = code === 404 || code === 410 ? "expired" : "failed";
        if (status === "failed") { failed = true; lastError = "Envoi impossible sur cet appareil."; }
        else sent++;
      }
      if (deliveryId) await tx.insert(pushReceipt).values({ deliveryId, deviceKey, status, attempts: 1, lastError }).onConflictDoUpdate({ target: [pushReceipt.deliveryId, pushReceipt.deviceKey], set: { status, lastError, attempts: sql`${pushReceipt.attempts} + 1`, updatedAt: new Date() } });
    }
    if (failed) return "Des appareils nécessitent une nouvelle tentative.";
    if (!sent) return "Aucune notification distribuée";
    return null;
  });
  if (error) throw Error(error);
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
