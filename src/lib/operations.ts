import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { db as productionDb } from "@/db";
import {
  intervention,
  interventionCorrection,
  user,
  reminderDelivery,
  workerState,
  rateLimit,
} from "@/db/schema";
import { requireMembership, DomainError } from "./domain";
import { revisionSchema, moneySchema } from "./value-schemas";
import { dateSchema, today } from "./recurrence";
type Database = typeof productionDb;
export async function correctIntervention(
  database: Database,
  actor: string,
  home: string,
  id: string,
  raw: unknown,
  timezone: string,
) {
  await requireMembership(database, actor, home);
  const data = z
    .object({
      revision: revisionSchema,
      completedOn: dateSchema,
      scheduledOn: dateSchema,
      notes: z.string().max(4000),
      cost: moneySchema,
      outcome: z.enum(["completed", "skipped", "cancelled"]),
    })
    .parse(raw);
  if (data.completedOn > today(timezone))
    throw new DomainError(
      "Une intervention doit être passée ou datée d’aujourd’hui.",
    );
  await database.transaction(async (tx) => {
    // The snapshot and update share a row lock and transaction: a rejected
    // stale correction cannot append an audit entry.
    const [before] = await tx.select().from(intervention).where(and(eq(intervention.id, id), eq(intervention.householdId, home), eq(intervention.revision, data.revision))).for("update");
    if (!before) throw new DomainError("L’intervention a changé. Actualise la page.");
    const [author] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actor));
    const [after] = await tx.update(intervention).set({ completedOn: data.completedOn, scheduledOn: data.scheduledOn, notes: data.notes, costCents: data.cost, outcome: data.outcome, revision: sql`${intervention.revision} + 1` }).where(eq(intervention.id, id)).returning();
    const snapshot = (entry: typeof intervention.$inferSelect) => ({ revision: entry.revision, completedOn: entry.completedOn, scheduledOn: entry.scheduledOn, notes: entry.notes, costCents: entry.costCents, outcome: entry.outcome });
    await tx.insert(interventionCorrection).values({ id: randomUUID(), householdId: home, interventionId: id, actorId: actor, actorName: author.name, before: snapshot(before), after: snapshot(after) });
  });
}
export async function retryReminder(
  database: Database,
  actor: string,
  home: string,
  id: string,
) {
  await requireMembership(database, actor, home, true);
  const rows = await database
    .update(reminderDelivery)
    .set({
      attempts: 0,
      status: "pending",
      lastError: "",
      nextAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reminderDelivery.id, id),
        eq(reminderDelivery.householdId, home),
        eq(reminderDelivery.status, "failed"),
      ),
    )
    .returning();
  if (!rows.length) throw new DomainError("Ce rappel n’est plus en échec.");
}
// Shared PostgreSQL limiter: concurrent buttons/processes cannot bypass the cooldown.
export async function claimMailTest(database: Database, actor: string) {
  const now = Date.now();
  const rows = await database
    .insert(rateLimit)
    .values({
      id: randomUUID(),
      key: `smtp-test:${actor}`,
      count: 1,
      lastRequest: now,
    })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: { lastRequest: now, count: 1 },
      setWhere: sql`${rateLimit.lastRequest} < ${now - 60000}`,
    })
    .returning();
  if (!rows.length)
    throw new DomainError("Attends une minute avant un nouveau test.");
}
export async function workerHeartbeat(
  database: Database,
  id: string,
  update: { completedAt?: Date; lastError?: string; intervalSeconds?: number } = {},
) {
  await database
    .insert(workerState)
    .values({ id, heartbeatAt: new Date(), ...update })
    .onConflictDoUpdate({
      target: workerState.id,
      set: { heartbeatAt: new Date(), ...update },
    });
}
