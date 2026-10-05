import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
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
} from "@/db/schema";
import { requireMembership } from "./domain";
import { dateSchema, nextDue, today } from "./recurrence";
const tables = {
  room,
  equipment,
  maintenance,
  shoppingList,
  shoppingItem,
  document,
};
export type Entity = keyof typeof tables;
const name = z.string().trim().min(1, "Renseigne un nom.").max(120);
const note = z.string().trim().max(4000);
const optionalDate = z
  .union([dateSchema, z.literal("")])
  .transform((v) => v || null);
const schemas = {
  room: z.object({
    name,
    description: note,
    position: z.coerce.number().int().min(0).max(10000),
  }),
  equipment: z
    .object({
      name,
      roomId: z.string().transform((v) => v || null),
      brand: z.string().trim().max(120),
      model: z.string().trim().max(120),
      serial: z.string().trim().max(120),
      notes: note,
      purchasedOn: optionalDate,
      warrantyUntil: optionalDate,
    })
    .refine(
      (v) =>
        !v.purchasedOn || !v.warrantyUntil || v.warrantyUntil >= v.purchasedOn,
      "La garantie doit se terminer après l’achat.",
    ),
  maintenance: z.object({
    title: name,
    notes: note,
    equipmentId: z.string().transform((v) => v || null),
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
    equipmentId: z.string().transform((v) => v || null),
    maintenanceId: z.string().transform((v) => v || null),
  }),
};
export async function owned(
  database: typeof productionDb,
  entity: Entity,
  householdId: string,
  id: string,
) {
  const table = tables[entity];
  const [row] = await database
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.householdId, householdId)));
  if (!row) throw new Error("Élément introuvable dans ce foyer.");
  return row;
}
export async function saveEntity(
  database: typeof productionDb,
  actorId: string,
  householdId: string,
  entity: Exclude<Entity, "document">,
  id: string,
  raw: unknown,
) {
  await requireMembership(database, actorId, householdId);
  const data = schemas[entity].parse(raw);
  if (id) await owned(database, entity, householdId, id);
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
  const values = {
    householdId,
    ...data,
    ...("dueOn" in data ? { anchorDay: Number(data.dueOn.slice(8)) } : {}),
  };
  const table = tables[entity];
  if (id)
    await database
      .update(table)
      .set(values)
      .where(and(eq(table.id, id), eq(table.householdId, householdId)));
  else
    await database
      .insert(table)
      .values({
        ...values,
        id: randomUUID(),
        householdId,
      } as typeof table.$inferInsert);
}
export async function completeTask(
  database: typeof productionDb,
  actorId: string,
  householdId: string,
  id: string,
  timezone: string,
  notes: string,
  expectedDue: string,
) {
  await requireMembership(database, actorId, householdId);
  const completedOn = today(timezone);
  await database.transaction(async (tx) => {
    const [task] = await tx
      .select()
      .from(maintenance)
      .where(
        and(eq(maintenance.id, id), eq(maintenance.householdId, householdId)),
      )
      .for("update");
    if (!task || task.archived) throw new Error("Tâche indisponible.");
    if (task.dueOn !== dateSchema.parse(expectedDue))
      throw new Error(
        "Le planning a changé. Actualise la page avant de confirmer.",
      );
    await tx
      .insert(intervention)
      .values({
        id: randomUUID(),
        householdId,
        maintenanceId: id,
        scheduledOn: task.dueOn,
        completedOn,
        completedBy: actorId,
        notes: note.parse(notes),
      });
    if (task.frequency === "once")
      await tx
        .update(maintenance)
        .set({ archived: true })
        .where(eq(maintenance.id, id));
    else {
      let dueOn = nextDue(
        task.recurrenceMode === "fixed" ? task.dueOn : completedOn,
        task.frequency,
        task.interval,
        task.recurrenceMode === "fixed"
          ? task.anchorDay
          : Number(completedOn.slice(8)),
      );
      // Completing an overdue task advances the plan to its next future occurrence.
      while (dueOn <= completedOn)
        dueOn = nextDue(dueOn, task.frequency, task.interval, task.anchorDay);
      await tx.update(maintenance).set({ dueOn }).where(eq(maintenance.id, id));
    }
  });
}
export async function changeEntity(
  database: typeof productionDb,
  actorId: string,
  householdId: string,
  entity: Entity,
  id: string,
  operation: string,
) {
  await requireMembership(database, actorId, householdId);
  await owned(database, entity, householdId, id);
  const table = tables[entity];
  const scope = and(eq(table.id, id), eq(table.householdId, householdId));
  if (operation === "delete") {
    if (entity !== "shoppingItem" && entity !== "shoppingList")
      throw new Error("Archive cet élément pour conserver son historique.");
    await database.delete(table).where(scope);
  } else if (operation === "toggle" && entity === "shoppingItem") {
    await database
      .update(shoppingItem)
      .set({ checked: sql`not ${shoppingItem.checked}` })
      .where(scope);
  } else if (
    (operation === "archive" || operation === "restore") &&
    (entity === "room" || entity === "equipment" || entity === "maintenance")
  ) {
    await database
      .update(tables[entity])
      .set({ archived: operation === "archive" })
      .where(scope);
  } else throw new Error("Action invalide.");
}
