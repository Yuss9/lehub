import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { db as productionDb } from "@/db";
import { shoppingItem, offlineMutation } from "@/db/schema";
import { requireMembership, DomainError } from "./domain";
import { owned, schemas, assertRevision } from "./home-domain";
export const shoppingMutationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("checked"),
    mutationId: z.string().uuid(),
    id: z.string().uuid(),
    checked: z.boolean(),
  }),
  z.object({
    kind: z.literal("add"),
    mutationId: z.string().uuid(),
    id: z.string().uuid(),
    data: schemas.shoppingItem,
  }),
  z.object({
    kind: z.literal("edit"),
    mutationId: z.string().uuid(),
    id: z.string().uuid(),
    revision: z.number().int().min(0),
    data: schemas.shoppingItem,
  }),
  z.object({
    kind: z.literal("delete"),
    mutationId: z.string().uuid(),
    id: z.string().uuid(),
    revision: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("undo"),
    mutationId: z.string().uuid(),
    id: z.string().uuid(),
    revision: z.number().int().min(0),
  }),
]);
export type ShoppingMutation = z.infer<typeof shoppingMutationSchema>;
export async function applyShoppingMutation(
  database: typeof productionDb,
  actorId: string,
  householdId: string,
  raw: unknown,
) {
  await requireMembership(database, actorId, householdId);
  const mutation = shoppingMutationSchema.parse(raw);
  return database.transaction(async (tx) => {
    const replay = await tx
      .insert(offlineMutation)
      .values({ id: mutation.mutationId, userId: actorId, householdId })
      .onConflictDoNothing()
      .returning();
    if (!replay.length) return;
    if (mutation.kind === "add" || mutation.kind === "edit") {
      await owned(
        tx as unknown as typeof productionDb,
        "shoppingList",
        householdId,
        mutation.data.listId,
      );
      if (mutation.data.equipmentId)
        await owned(
          tx as unknown as typeof productionDb,
          "equipment",
          householdId,
          mutation.data.equipmentId,
        );
      if (mutation.data.maintenanceId)
        await owned(
          tx as unknown as typeof productionDb,
          "maintenance",
          householdId,
          mutation.data.maintenanceId,
        );
    }
    if (mutation.kind === "add") {
      await tx
        .insert(shoppingItem)
        .values({ ...mutation.data, id: mutation.id, householdId });
      return;
    }
    const [item] = await tx
      .select()
      .from(shoppingItem)
      .where(
        and(
          eq(shoppingItem.id, mutation.id),
          eq(shoppingItem.householdId, householdId),
        ),
      )
      .for("update");
    if (!item || (item.deletedAt && mutation.kind !== "undo"))
      throw new DomainError("Article introuvable ou supprimé.");
    await owned(
      tx as unknown as typeof productionDb,
      "shoppingList",
      householdId,
      item.listId,
    );
    if (mutation.kind !== "checked")
      assertRevision(mutation.revision, item.revision);
    const values =
      mutation.kind === "checked"
        ? { checked: mutation.checked }
        : mutation.kind === "edit"
          ? mutation.data
          : { deletedAt: mutation.kind === "delete" ? new Date() : null };
    await tx
      .update(shoppingItem)
      .set({ ...values, revision: sql`${shoppingItem.revision} + 1` })
      .where(
        and(
          eq(shoppingItem.id, item.id),
          eq(shoppingItem.householdId, householdId),
          mutation.kind !== "undo" ? isNull(shoppingItem.deletedAt) : undefined,
        ),
      );
  });
}
