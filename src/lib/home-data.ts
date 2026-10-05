import {
  eq,
  asc,
  desc,
  and,
  isNull,
  ilike,
  or,
  count,
  lte,
  gte,
} from "drizzle-orm";
import { db } from "@/db";
import {
  room,
  equipment,
  maintenance,
  intervention,
  shoppingList,
  shoppingItem,
  document,
  user,
} from "@/db/schema";
import { today } from "./recurrence";
export type Module =
  | "rooms"
  | "equipments"
  | "tasks"
  | "history"
  | "lists"
  | "items"
  | "documents";
export const PAGE_SIZE = 20;
export function pageNumber(raw?: string) {
  const n = Number(raw || 1);
  return Number.isInteger(n) && n > 0 && n <= 10000 ? n : 1;
}
export async function homeData(
  householdId: string,
  options: {
    modules?: Module[];
    primary?: Module;
    page?: number;
    query?: string;
    category?: string;
    roomId?: string;
    archived?: boolean;
    month?: string;
    all?: boolean;
    equipmentId?: string;
  } = {},
) {
  const wanted = new Set(
    options.modules || [
      "rooms",
      "equipments",
      "tasks",
      "history",
      "lists",
      "items",
      "documents",
    ],
  );
  const q = options.query
    ?.trim()
    .slice(0, 120)
    .replace(/[\\%_]/g, "\\$&");
  const search = (key: Module, ...fields: Parameters<typeof ilike>[0][]) =>
    q && (!options.primary || options.primary === key)
      ? or(...fields.map((f) => ilike(f, `%${q}%`)))
      : undefined;
  const scopes = {
    rooms: and(
      eq(room.householdId, householdId),
      search("rooms", room.name, room.description),
    ),
    equipments: and(
      eq(equipment.householdId, householdId),
      search(
        "equipments",
        equipment.name,
        equipment.brand,
        equipment.model,
        equipment.serial,
        equipment.notes,
        equipment.tags,
        equipment.seller,
      ),
      options.primary === "equipments" && !options.archived
        ? eq(equipment.archived, false)
        : undefined,
      options.roomId ? eq(equipment.roomId, options.roomId) : undefined,
      options.equipmentId ? eq(equipment.id, options.equipmentId) : undefined,
    ),
    tasks: and(
      eq(maintenance.householdId, householdId),
      search("tasks", maintenance.title, maintenance.notes),
      options.primary === "tasks" && !options.archived
        ? eq(maintenance.archived, false)
        : undefined,
      options.month ? ilike(maintenance.dueOn, `${options.month}%`) : undefined,
      options.equipmentId
        ? eq(maintenance.equipmentId, options.equipmentId)
        : undefined,
    ),
    history: and(
      eq(intervention.householdId, householdId),
      search("history", intervention.notes, intervention.taskTitle),
      options.equipmentId
        ? eq(maintenance.equipmentId, options.equipmentId)
        : undefined,
    ),
    lists: and(
      eq(shoppingList.householdId, householdId),
      isNull(shoppingList.deletedAt),
      search("lists", shoppingList.name),
    ),
    items: and(
      eq(shoppingItem.householdId, householdId),
      isNull(shoppingItem.deletedAt),
      isNull(shoppingList.deletedAt),
      search("items", shoppingItem.name, shoppingItem.category),
    ),
    documents: and(
      eq(document.householdId, householdId),
      isNull(document.deletedAt),
      search(
        "documents",
        document.title,
        document.originalName,
        document.tags,
        document.extractedText,
      ),
      options.category ? eq(document.category, options.category) : undefined,
      options.equipmentId
        ? eq(document.equipmentId, options.equipmentId)
        : undefined,
    ),
  };
  const limit = (key: Module) =>
    options.all
      ? undefined
      : options.primary === key || (q && !options.primary)
        ? PAGE_SIZE
        : key === "history"
          ? PAGE_SIZE
          : undefined;
  const offset = (key: Module) =>
    options.primary === key || (q && !options.primary)
      ? ((options.page || 1) - 1) * PAGE_SIZE
      : 0;
  const [rooms, equipments, tasks, history, lists, items, documents] =
    await Promise.all([
      wanted.has("rooms")
        ? db
            .select()
            .from(room)
            .where(scopes.rooms)
            .orderBy(asc(room.position), asc(room.name), asc(room.id))
            .limit(limit("rooms") || 10000)
            .offset(offset("rooms"))
        : [],
      wanted.has("equipments")
        ? db
            .select()
            .from(equipment)
            .where(scopes.equipments)
            .orderBy(asc(equipment.name), asc(equipment.id))
            .limit(limit("equipments") || 10000)
            .offset(offset("equipments"))
        : [],
      wanted.has("tasks")
        ? db
            .select()
            .from(maintenance)
            .where(scopes.tasks)
            .orderBy(asc(maintenance.dueOn), asc(maintenance.id))
            .limit(limit("tasks") || 10000)
            .offset(offset("tasks"))
        : [],
      wanted.has("history")
        ? db
            .select({
              id: intervention.id,
              householdId: intervention.householdId,
              maintenanceId: intervention.maintenanceId,
              completedOn: intervention.completedOn,
              scheduledOn: intervention.scheduledOn,
              notes: intervention.notes,
              completedBy: intervention.completedBy,
              outcome: intervention.outcome,
              costCents: intervention.costCents,
              taskTitle: intervention.taskTitle,
              author: user.name,
            })
            .from(intervention)
            .innerJoin(
              maintenance,
              eq(maintenance.id, intervention.maintenanceId),
            )
            .leftJoin(user, eq(user.id, intervention.completedBy))
            .where(scopes.history)
            .orderBy(desc(intervention.completedOn), desc(intervention.id))
            .limit(limit("history") || 10000)
            .offset(offset("history"))
        : [],
      wanted.has("lists")
        ? db
            .select()
            .from(shoppingList)
            .where(scopes.lists)
            .orderBy(asc(shoppingList.name), asc(shoppingList.id))
            .limit(limit("lists") || 10000)
            .offset(offset("lists"))
        : [],
      wanted.has("items")
        ? db
            .select({
              id: shoppingItem.id,
              householdId: shoppingItem.householdId,
              listId: shoppingItem.listId,
              name: shoppingItem.name,
              quantity: shoppingItem.quantity,
              checked: shoppingItem.checked,
              equipmentId: shoppingItem.equipmentId,
              maintenanceId: shoppingItem.maintenanceId,
              category: shoppingItem.category,
              revision: shoppingItem.revision,
              deletedAt: shoppingItem.deletedAt,
            })
            .from(shoppingItem)
            .innerJoin(shoppingList, eq(shoppingList.id, shoppingItem.listId))
            .where(scopes.items)
            .orderBy(asc(shoppingItem.name), asc(shoppingItem.id))
            .limit(limit("items") || 10000)
            .offset(offset("items"))
        : [],
      wanted.has("documents")
        ? db
            .select()
            .from(document)
            .where(scopes.documents)
            .orderBy(asc(document.title), asc(document.id))
            .limit(limit("documents") || 10000)
            .offset(offset("documents"))
        : [],
    ]);
  let total = 0;
  const p = options.primary;
  if (p) {
    const table = {
      rooms: room,
      equipments: equipment,
      tasks: maintenance,
      history: intervention,
      lists: shoppingList,
      items: shoppingItem,
      documents: document,
    }[p];
    if (p === "items") {
      const [r] = await db
        .select({ n: count() })
        .from(shoppingItem)
        .innerJoin(shoppingList, eq(shoppingList.id, shoppingItem.listId))
        .where(scopes.items);
      total = r.n;
    } else if (p === "history") {
      const [r] = await db
        .select({ n: count() })
        .from(intervention)
        .innerJoin(maintenance, eq(maintenance.id, intervention.maintenanceId))
        .where(scopes.history);
      total = r.n;
    } else {
      const [r] = await db.select({ n: count() }).from(table).where(scopes[p]);
      total = r.n;
    }
  }
  return {
    rooms,
    equipments,
    tasks,
    history,
    lists,
    items,
    documents,
    total,
    page: options.page || 1,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
export async function dashboardData(householdId: string, timezone: string) {
  const current = today(timezone);
  const horizon = new Date(`${current}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 90);
  const until = horizon.toISOString().slice(0, 10);
  const [
    rooms,
    equipments,
    tasks,
    documents,
    items,
    overdue,
    upcoming,
    warranties,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(room)
      .where(and(eq(room.householdId, householdId), eq(room.archived, false))),
    db
      .select({ n: count() })
      .from(equipment)
      .where(
        and(
          eq(equipment.householdId, householdId),
          eq(equipment.archived, false),
        ),
      ),
    db
      .select({ n: count() })
      .from(maintenance)
      .where(
        and(
          eq(maintenance.householdId, householdId),
          eq(maintenance.archived, false),
        ),
      ),
    db
      .select({ n: count() })
      .from(document)
      .where(
        and(eq(document.householdId, householdId), isNull(document.deletedAt)),
      ),
    db
      .select({ n: count() })
      .from(shoppingItem)
      .innerJoin(shoppingList, eq(shoppingList.id, shoppingItem.listId))
      .where(
        and(
          eq(shoppingItem.householdId, householdId),
          eq(shoppingItem.checked, false),
          isNull(shoppingItem.deletedAt),
          isNull(shoppingList.deletedAt),
        ),
      ),
    db
      .select({ n: count() })
      .from(maintenance)
      .where(
        and(
          eq(maintenance.householdId, householdId),
          eq(maintenance.archived, false),
          lte(maintenance.dueOn, current),
        ),
      ),
    db
      .select()
      .from(maintenance)
      .where(
        and(
          eq(maintenance.householdId, householdId),
          eq(maintenance.archived, false),
        ),
      )
      .orderBy(asc(maintenance.dueOn))
      .limit(5),
    db
      .select()
      .from(equipment)
      .where(
        and(
          eq(equipment.householdId, householdId),
          eq(equipment.archived, false),
          gte(equipment.warrantyUntil, current),
          lte(equipment.warrantyUntil, until),
        ),
      )
      .orderBy(asc(equipment.warrantyUntil))
      .limit(10),
  ]);
  return {
    rooms: rooms[0].n,
    equipments: equipments[0].n,
    tasks: tasks[0].n,
    documents: documents[0].n,
    items: items[0].n,
    overdue: overdue[0].n,
    upcoming,
    warranties,
  };
}
