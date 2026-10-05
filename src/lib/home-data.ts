import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  room,
  equipment,
  maintenance,
  intervention,
  shoppingList,
  shoppingItem,
  document,
} from "@/db/schema";
export async function homeData(householdId: string) {
  const [rooms, equipments, tasks, history, lists, items, documents] =
    await Promise.all([
      db
        .select()
        .from(room)
        .where(eq(room.householdId, householdId))
        .orderBy(asc(room.position), asc(room.name)),
      db
        .select()
        .from(equipment)
        .where(eq(equipment.householdId, householdId))
        .orderBy(asc(equipment.name)),
      db
        .select()
        .from(maintenance)
        .where(eq(maintenance.householdId, householdId))
        .orderBy(asc(maintenance.dueOn)),
      db
        .select()
        .from(intervention)
        .where(eq(intervention.householdId, householdId))
        .orderBy(asc(intervention.completedOn)),
      db
        .select()
        .from(shoppingList)
        .where(eq(shoppingList.householdId, householdId))
        .orderBy(asc(shoppingList.name)),
      db
        .select()
        .from(shoppingItem)
        .where(eq(shoppingItem.householdId, householdId))
        .orderBy(asc(shoppingItem.name)),
      db
        .select()
        .from(document)
        .where(eq(document.householdId, householdId))
        .orderBy(asc(document.title)),
    ]);
  return { rooms, equipments, tasks, history, lists, items, documents };
}
