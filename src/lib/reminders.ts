import { randomUUID } from "node:crypto";
import { eq, and, sql, lte } from "drizzle-orm";
import type { db as productionDb } from "@/db";
import {
  household,
  user,
  membership,
  maintenance,
  equipment,
  reminderPreference,
  reminderDelivery,
} from "@/db/schema";
import { today } from "./recurrence";
import { sendPush } from "./push";
import { sendMail } from "./mail";
type Database = typeof productionDb;
export async function queueReminders(database: Database, now = new Date()) {
  const prefs = await database
    .select({ pref: reminderPreference, home: household })
    .from(reminderPreference)
    .innerJoin(household, eq(household.id, reminderPreference.householdId))
    .innerJoin(
      membership,
      and(
        eq(membership.householdId, reminderPreference.householdId),
        eq(membership.userId, reminderPreference.userId),
      ),
    )
    .where(
      sql`${reminderPreference.emailEnabled} or ${reminderPreference.pushEnabled}`,
    );
  for (const { pref, home } of prefs) {
    const date = today(home.timezone, now);
    const horizon = new Date(`${date}T00:00:00Z`);
    horizon.setUTCDate(horizon.getUTCDate() + pref.leadDays);
    const until = horizon.toISOString().slice(0, 10);
    const [tasks, devices] = await Promise.all([
      database
        .select()
        .from(maintenance)
        .where(
          and(
            eq(maintenance.householdId, home.id),
            eq(maintenance.archived, false),
            lte(maintenance.dueOn, until),
          ),
        ),
      database
        .select()
        .from(equipment)
        .where(
          and(
            eq(equipment.householdId, home.id),
            eq(equipment.archived, false),
            lte(equipment.warrantyUntil, until),
          ),
        ),
    ]);
    const targets = [
      ...tasks.map((t) => ({
        kind: "maintenance",
        targetId: t.id,
        dueOn: t.dueOn,
      })),
      ...devices
        .filter((d) => d.warrantyUntil! >= date)
        .map((d) => ({
          kind: "warranty",
          targetId: d.id,
          dueOn: d.warrantyUntil!,
        })),
    ];
    for (const target of targets)
      for (const channel of [
        ...(pref.emailEnabled ? ["email"] : []),
        ...(pref.pushEnabled ? ["push"] : []),
      ])
        await database
          .insert(reminderDelivery)
          .values({
            id: randomUUID(),
            householdId: home.id,
            userId: pref.userId,
            ...target,
            channel,
          })
          .onConflictDoNothing();
  }
}
export async function deliverReminder(
  database: Database,
  send = sendMail,
  push = sendPush,
) {
  return database.transaction(async (tx) => {
    const [delivery] = await tx
      .select()
      .from(reminderDelivery)
      .where(
        and(
          sql`${reminderDelivery.status} in ('pending','failed')`,
          lte(reminderDelivery.nextAttemptAt, new Date()),
          sql`${reminderDelivery.attempts} < 5`,
        ),
      )
      .for("update", { skipLocked: true })
      .limit(1);
    if (!delivery) return false;
    const [recipient] = await tx
      .select({ email: user.email, home: household, pref: reminderPreference })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .innerJoin(household, eq(household.id, membership.householdId))
      .innerJoin(
        reminderPreference,
        and(
          eq(reminderPreference.householdId, membership.householdId),
          eq(reminderPreference.userId, membership.userId),
        ),
      )
      .where(
        and(
          eq(membership.householdId, delivery.householdId),
          eq(membership.userId, delivery.userId),
          delivery.channel === "push"
            ? eq(reminderPreference.pushEnabled, true)
            : eq(reminderPreference.emailEnabled, true),
        ),
      );
    let title: string | undefined;
    if (delivery.kind === "maintenance") {
      const [task] = await tx
        .select()
        .from(maintenance)
        .where(
          and(
            eq(maintenance.id, delivery.targetId),
            eq(maintenance.householdId, delivery.householdId),
            eq(maintenance.archived, false),
            eq(maintenance.dueOn, delivery.dueOn),
          ),
        );
      title = task?.title;
    } else {
      const [device] = await tx
        .select()
        .from(equipment)
        .where(
          and(
            eq(equipment.id, delivery.targetId),
            eq(equipment.householdId, delivery.householdId),
            eq(equipment.archived, false),
            eq(equipment.warrantyUntil, delivery.dueOn),
          ),
        );
      title = device?.name;
    }
    if (!recipient || !title) {
      await tx
        .update(reminderDelivery)
        .set({ status: "cancelled" })
        .where(eq(reminderDelivery.id, delivery.id));
      return true;
    }
    try {
      if (delivery.channel === "push")
        await push(
          tx as unknown as Database,
          delivery.userId,
          delivery.householdId,
        );
      else
        await send(
          recipient.email,
          `lehub — ${delivery.kind === "maintenance" ? "entretien" : "garantie"} : ${title}`,
          `${recipient.home.name}\n\n${title}\nÉchéance : ${delivery.dueOn}\n\n${new URL(delivery.kind === "maintenance" ? `/maintenance#${delivery.targetId}` : `/equipment/${delivery.targetId}`, process.env.BETTER_AUTH_URL || "http://localhost:3000")}\n\nTu peux désactiver ces rappels dans les paramètres de lehub.`,
        );
      await tx
        .update(reminderDelivery)
        .set({
          status: "sent",
          lastError: "",
          updatedAt: new Date(),
          sentAt: new Date(),
          attempts: delivery.attempts + 1,
        })
        .where(eq(reminderDelivery.id, delivery.id));
    } catch {
      await tx
        .update(reminderDelivery)
        .set({
          status: "failed",
          lastError:
            delivery.channel === "push"
              ? "Distribution push impossible. Vérifie les clés VAPID et les appareils inscrits."
              : "Envoi SMTP impossible. Vérifie le relais, les identifiants et TLS.",
          updatedAt: new Date(),
          attempts: delivery.attempts + 1,
          nextAttemptAt: new Date(
            Date.now() + Math.pow(2, delivery.attempts) * 60000,
          ),
        })
        .where(eq(reminderDelivery.id, delivery.id));
    }
    return true;
  });
}
