import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { db as productionDb } from "@/db";
import {
  room,
  equipment,
  maintenance,
  intervention,
  shoppingList,
  shoppingItem,
  document,
  offlineMutation,
} from "@/db/schema";
import { requireMembership, DomainError } from "./domain";
import { dateSchema, nextDue, today } from "./recurrence";
import { moneySchema, tagsSchema, revisionSchema } from "./value-schemas";
export const tables = {
  room,
  equipment,
  maintenance,
  shoppingList,
  shoppingItem,
  document,
};
export type Entity = keyof typeof tables;
type Database = typeof productionDb;
const name = z.string().trim().min(1, "Renseigne un nom.").max(120);
const note = z.string().trim().max(4000);
const optionalDate = z
  .union([dateSchema, z.literal("")])
  .transform((v) => v || null);
const nullableId = z
  .string()
  .default("")
  .transform((v) => v || null);
export const schemas = {
  room: z.object({
    name,
    description: note,
    position: z.coerce.number().int().min(0).max(10000),
  }),
  equipment: z
    .object({
      name,
      roomId: nullableId,
      brand: z.string().trim().max(120),
      model: z.string().trim().max(120),
      serial: z.string().trim().max(120),
      notes: note,
      purchasedOn: optionalDate,
      warrantyUntil: optionalDate,
      purchasedCents: moneySchema,
      seller: z.string().trim().max(120).default(""),
      tags: tagsSchema,
    })
    .refine(
      (v) =>
        !v.purchasedOn || !v.warrantyUntil || v.warrantyUntil >= v.purchasedOn,
      "La garantie doit se terminer après l’achat.",
    ),
  maintenance: z.object({
    title: name,
    notes: note,
    equipmentId: nullableId,
    dueOn: dateSchema,
    frequency: z.enum(["once", "weekly", "monthly", "yearly"]),
    interval: z.coerce.number().int().min(1).max(120),
    recurrenceMode: z.enum(["fixed", "completion"]),
  }),
  shoppingList: z.object({ name }),
  shoppingItem: z.object({
    name,
    quantity: z.string().trim().min(1).max(80),
    listId: z.string().min(1),
    equipmentId: nullableId,
    maintenanceId: nullableId,
    category: z.string().trim().max(80).default("Autres"),
  }),
  document: z.object({
    title: name,
    category: z.enum(["invoice", "receipt", "manual", "photo", "other"]),
    equipmentId: nullableId,
    tags: tagsSchema,
  }),
};
export async function owned(
  database: Database,
  entity: Entity,
  householdId: string,
  id: string,
  includeDeleted = false,
) {
  const table = tables[entity];
  const [row] = await database
    .select()
    .from(table)
    .where(
      and(
        eq(table.id, id),
        eq(table.householdId, householdId),
        !includeDeleted && "deletedAt" in table
          ? isNull(table.deletedAt)
          : undefined,
      ),
    );
  if (!row) throw new DomainError("Élément introuvable dans ce foyer.");
  return row;
}
export function assertRevision(expected: unknown, actual: number) {
  if (revisionSchema.parse(expected) !== actual)
    throw new DomainError(
      "Cet élément a été modifié. Actualise la page avant de réessayer.",
    );
}
export async function saveEntity(
  database: Database,
  actorId: string,
  householdId: string,
  entity: Entity,
  id: string,
  raw: unknown,
) {
  await requireMembership(database, actorId, householdId);
  const data = schemas[entity].parse(raw);
  if ("roomId" in data && typeof data.roomId === "string" && data.roomId)
    await owned(database, "room", householdId, data.roomId);
  if (
    "equipmentId" in data &&
    typeof data.equipmentId === "string" &&
    data.equipmentId
  )
    await owned(database, "equipment", householdId, data.equipmentId);
  if (
    "maintenanceId" in data &&
    typeof data.maintenanceId === "string" &&
    data.maintenanceId
  )
    await owned(database, "maintenance", householdId, data.maintenanceId);
  if ("listId" in data && typeof data.listId === "string")
    await owned(database, "shoppingList", householdId, data.listId);
  const existing = id ? await owned(database, entity, householdId, id) : null;
  if (
    entity === "document" &&
    "category" in data &&
    data.category === "photo" &&
    existing &&
    "mime" in existing &&
    !existing.mime.startsWith("image/")
  )
    throw new DomainError("Un fichier PDF ne peut pas devenir une photo.");
  const table = tables[entity];
  const expected = id
    ? revisionSchema.parse((raw as { revision?: unknown }).revision)
    : 0;
  const anchor =
    "dueOn" in data
      ? {
          anchorDay:
            existing &&
            "dueOn" in existing &&
            existing.dueOn === data.dueOn &&
            "anchorDay" in existing
              ? existing.anchorDay
              : Number(data.dueOn.slice(8)),
        }
      : {};
  const values = { householdId, ...data, ...anchor };
  if (!id) {
    if (entity === "document")
      throw new DomainError("Dépose un fichier pour créer un document.");
    await database
      .insert(table)
      .values({ ...values, id: randomUUID() } as typeof table.$inferInsert);
  } else {
    const changed = await database
      .update(table)
      .set({ ...values, revision: sql`${table.revision} + 1` })
      .where(
        and(
          eq(table.id, id),
          eq(table.householdId, householdId),
          eq(table.revision, expected),
        ),
      )
      .returning({ id: table.id });
    if (!changed.length)
      throw new DomainError(
        "Cet élément a été modifié. Actualise la page avant de réessayer.",
      );
  }
}
/** Move only the next occurrence; keep the recurrence's original reference day. */
export async function postponeTask(
  database: Database,
  actorId: string,
  householdId: string,
  id: string,
  revision: unknown,
  date: unknown,
) {
  await requireMembership(database, actorId, householdId);
  const dueOn = dateSchema.parse(date);
  const changed = await database
    .update(maintenance)
    .set({ dueOn, revision: sql`${maintenance.revision} + 1` })
    .where(
      and(
        eq(maintenance.id, id),
        eq(maintenance.householdId, householdId),
        eq(maintenance.revision, revisionSchema.parse(revision)),
        eq(maintenance.archived, false),
      ),
    )
    .returning({ id: maintenance.id });
  if (!changed.length)
    throw new DomainError("Le planning a changé. Actualise la page.");
}
export async function completeTask(
  database: Database,
  actorId: string,
  householdId: string,
  id: string,
  timezone: string,
  notes: string,
  expectedDue: string,
  options: {
    revision: unknown;
    completedOn?: string;
    cost?: string;
    outcome?: "completed" | "skipped";
  },
) {
  await requireMembership(database, actorId, householdId);
  const current = today(timezone);
  const completedOn = dateSchema.parse(options.completedOn || current);
  if (completedOn > current)
    throw new DomainError(
      "La réalisation ne peut pas être datée dans le futur.",
    );
  const costCents = moneySchema.parse(options.cost || "");
  await database.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(maintenance)
      .where(
        and(eq(maintenance.id, id), eq(maintenance.householdId, householdId)),
      )
      .for("update");
    if (!task || task.archived) throw new DomainError("Tâche indisponible.");
    assertRevision(options.revision, task.revision);
    if (task.dueOn !== dateSchema.parse(expectedDue))
      throw new DomainError(
        "Le planning a changé. Actualise la page avant de confirmer.",
      );
    await tx.insert(intervention).values({
      id: randomUUID(),
      householdId,
      maintenanceId: id,
      scheduledOn: task.dueOn,
      completedOn,
      completedBy: actorId,
      notes: note.parse(notes),
      costCents,
      outcome: options.outcome || "completed",
      taskTitle: task.title,
    });
    if (task.frequency === "once")
      await tx
        .update(maintenance)
        .set({ archived: true, revision: sql`${maintenance.revision} + 1` })
        .where(eq(maintenance.id, id));
    else {
      const base =
        task.recurrenceMode === "completion" && options.outcome !== "skipped"
          ? completedOn
          : task.dueOn;
      const anchorDay =
        task.recurrenceMode === "completion" && options.outcome !== "skipped"
          ? Number(completedOn.slice(8))
          : task.anchorDay;
      let dueOn = nextDue(base, task.frequency, task.interval, anchorDay);
      while (dueOn <= current)
        dueOn = nextDue(dueOn, task.frequency, task.interval, anchorDay);
      await tx
        .update(maintenance)
        .set({ dueOn, revision: sql`${maintenance.revision} + 1` })
        .where(eq(maintenance.id, id));
    }
  });
}
export async function setShoppingChecked(
  database: Database,
  actorId: string,
  householdId: string,
  id: string,
  checked: boolean,
  mutationId?: string,
) {
  await requireMembership(database, actorId, householdId);
  await database.transaction(async (tx) => {
    if (mutationId) {
      z.string().uuid().parse(mutationId);
      const inserted = await tx
        .insert(offlineMutation)
        .values({ id: mutationId, userId: actorId, householdId })
        .onConflictDoNothing()
        .returning();
      if (!inserted.length) return;
    }
    const changed = await tx
      .update(shoppingItem)
      .set({ checked, revision: sql`${shoppingItem.revision} + 1` })
      .where(
        and(
          eq(shoppingItem.id, id),
          eq(shoppingItem.householdId, householdId),
          isNull(shoppingItem.deletedAt),
        ),
      )
      .returning({ id: shoppingItem.id });
    if (!changed.length)
      throw new DomainError("Article introuvable ou supprimé.");
  });
}
export async function changeEntity(
  database: Database,
  actorId: string,
  householdId: string,
  entity: Entity,
  id: string,
  operation: string,
  expectedRevision: unknown,
) {
  await requireMembership(database, actorId, householdId);
  const row = await owned(
    database,
    entity,
    householdId,
    id,
    operation === "undo",
  );
  assertRevision(expectedRevision, row.revision);
  const table = tables[entity];
  const scope = and(
    eq(table.id, id),
    eq(table.householdId, householdId),
    eq(table.revision, row.revision),
  );
  const bump = { revision: sql`${table.revision} + 1` };
  let changed: { id: string }[];
  if (
    (operation === "delete" || operation === "undo") &&
    (entity === "shoppingItem" ||
      entity === "shoppingList" ||
      entity === "document")
  ) {
    changed = await database
      .update(tables[entity])
      .set({ ...bump, deletedAt: operation === "delete" ? new Date() : null })
      .where(scope)
      .returning({ id: table.id });
  } else if (
    (operation === "archive" || operation === "restore") &&
    (entity === "room" || entity === "equipment" || entity === "maintenance")
  ) {
    changed = await database
      .update(tables[entity])
      .set({ ...bump, archived: operation === "archive" })
      .where(scope)
      .returning({ id: table.id });
  } else throw new DomainError("Action invalide.");
  if (!changed.length)
    throw new DomainError("Cet élément a été modifié. Actualise la page.");
}
export async function clearPurchased(
  database: Database,
  actorId: string,
  householdId: string,
  listId: string,
) {
  await requireMembership(database, actorId, householdId);
  await owned(database, "shoppingList", householdId, listId);
  await database
    .update(shoppingItem)
    .set({ deletedAt: new Date(), revision: sql`${shoppingItem.revision} + 1` })
    .where(
      and(
        eq(shoppingItem.householdId, householdId),
        eq(shoppingItem.listId, listId),
        eq(shoppingItem.checked, true),
        isNull(shoppingItem.deletedAt),
      ),
    );
}

export async function recordPastIntervention(
  database: Database,
  actorId: string,
  householdId: string,
  id: string,
  timezone: string,
  raw: {
    revision: unknown;
    completedOn: string;
    scheduledOn: string;
    cost: string;
    notes: string;
  },
) {
  await requireMembership(database, actorId, householdId);
  const completedOn = dateSchema.parse(raw.completedOn);
  if (completedOn > today(timezone))
    throw new DomainError("Choisis une date passée ou aujourd’hui.");
  await database.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(maintenance)
      .where(
        and(eq(maintenance.id, id), eq(maintenance.householdId, householdId)),
      )
      .for("update");
    if (!task) throw new DomainError("Entretien introuvable.");
    assertRevision(raw.revision, task.revision);
    await tx.insert(intervention).values({
      id: randomUUID(),
      householdId,
      maintenanceId: id,
      completedOn,
      scheduledOn: dateSchema.parse(raw.scheduledOn || completedOn),
      costCents: moneySchema.parse(raw.cost),
      notes: note.parse(raw.notes),
      completedBy: actorId,
      taskTitle: task.title,
    });
    await tx
      .update(maintenance)
      .set({ revision: sql`${maintenance.revision} + 1` })
      .where(eq(maintenance.id, id));
  });
}
