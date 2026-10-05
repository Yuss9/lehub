import { and, eq, isNull, or, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  shoppingItem,
  shoppingList,
  equipment,
  maintenance,
} from "@/db/schema";
export async function shoppingState(
  household: { id: string; name: string },
  user: { id: string; name: string },
) {
  const lists = await db
    .select()
    .from(shoppingList)
    .where(
      and(
        eq(shoppingList.householdId, household.id),
        isNull(shoppingList.deletedAt),
      ),
    )
    .orderBy(shoppingList.name);
  const items = await db
    .select({
      id: shoppingItem.id,
      listId: shoppingItem.listId,
      name: shoppingItem.name,
      quantity: shoppingItem.quantity,
      category: shoppingItem.category,
      checked: shoppingItem.checked,
      revision: shoppingItem.revision,
      equipmentId: shoppingItem.equipmentId,
      maintenanceId: shoppingItem.maintenanceId,
      deletedAt: shoppingItem.deletedAt,
    })
    .from(shoppingItem)
    .innerJoin(shoppingList, eq(shoppingList.id, shoppingItem.listId))
    .where(
      and(
        eq(shoppingItem.householdId, household.id),
        isNull(shoppingList.deletedAt),
        or(
          isNull(shoppingItem.deletedAt),
          gte(shoppingItem.deletedAt, new Date(Date.now() - 30 * 86400000)),
        ),
      ),
    );
  const [equipmentOptions, taskOptions] = await Promise.all([
    db
      .select({ id: equipment.id, name: equipment.name })
      .from(equipment)
      .where(
        and(
          eq(equipment.householdId, household.id),
          eq(equipment.archived, false),
        ),
      ),
    db
      .select({ id: maintenance.id, name: maintenance.title })
      .from(maintenance)
      .where(
        and(
          eq(maintenance.householdId, household.id),
          eq(maintenance.archived, false),
        ),
      ),
  ]);
  return {
    equipmentOptions,
    taskOptions,
    scope: `${user.id}:${household.id}`,
    owner: user.name,
    household: household.name,
    lists,
    items: items.map((i) => ({
      ...i,
      deletedAt: i.deletedAt?.toISOString() || null,
    })),
  };
}
