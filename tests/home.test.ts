import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { db as productionDb } from "@/db";
import {
  saveEntity,
  owned,
  changeEntity,
  completeTask,
} from "@/lib/home-domain";
import { dateSchema, nextDue, today } from "@/lib/recurrence";
import {
  detectMime,
  saveFile,
  removePrivateFile,
  readPrivateFile,
} from "@/lib/files";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const client = new PGlite();
const database = drizzle(client, { schema }) as unknown as typeof productionDb;
let directory: string;
beforeAll(async () => {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await database.insert(schema.user).values([
    { id: "member", name: "Test", email: "test@example.test" },
    { id: "outsider", name: "Other", email: "other@example.test" },
  ]);
  await database.insert(schema.household).values([
    { id: "home", name: "Home" },
    { id: "foreign", name: "Foreign" },
  ]);
  await database
    .insert(schema.membership)
    .values({ userId: "member", householdId: "home", role: "member" });
  await database
    .insert(schema.room)
    .values({ id: "foreign-room", householdId: "foreign", name: "Secret" });
  directory = await mkdtemp(path.join(tmpdir(), "lehub-files-"));
  process.env.DOCUMENTS_DIR = directory;
});
afterAll(async () => {
  await client.close();
  await rm(directory, { recursive: true, force: true });
  delete process.env.DOCUMENTS_DIR;
});
const appliance = {
  name: "Lave-linge",
  roomId: "",
  brand: "Bosch",
  model: "X",
  serial: "123",
  notes: "",
  purchasedOn: "2026-01-01",
  warrantyUntil: "2028-01-01",
};
describe("Modules du foyer", () => {
  it("creates and updates real household data and rejects foreign associations", async () => {
    await saveEntity(database, "member", "home", "room", "", {
      name: "Cuisine",
      description: "",
      position: "2",
    });
    const [room] = await database
      .select()
      .from(schema.room)
      .where(eq(schema.room.householdId, "home"));
    await saveEntity(database, "member", "home", "room", room.id, {
      name: "Buanderie",
      description: "Au rez-de-chaussée",
      position: "0",
    });
    await expect(
      saveEntity(database, "member", "home", "equipment", "", {
        ...appliance,
        roomId: "foreign-room",
      }),
    ).rejects.toThrow("introuvable");
    await saveEntity(database, "member", "home", "equipment", "", {
      ...appliance,
      roomId: room.id,
    });
    const [item] = await database.select().from(schema.equipment);
    expect(item.roomId).toBe(room.id);
    await expect(
      owned(database, "equipment", "foreign", item.id),
    ).rejects.toThrow();
    await expect(
      saveEntity(database, "outsider", "home", "equipment", item.id, appliance),
    ).rejects.toThrow("non autorisée");
    await changeEntity(
      database,
      "member",
      "home",
      "equipment",
      item.id,
      "archive",
    );
    expect((await database.select().from(schema.equipment))[0].archived).toBe(
      true,
    );
    await changeEntity(
      database,
      "member",
      "home",
      "equipment",
      item.id,
      "restore",
    );
    await expect(
      saveEntity(database, "member", "home", "equipment", item.id, {
        ...appliance,
        warrantyUntil: "2025-01-01",
      }),
    ).rejects.toThrow();
  });
  it("completes recurring work transactionally, preserving history and advancing overdue dates", async () => {
    await saveEntity(database, "member", "home", "maintenance", "", {
      title: "Filtre",
      notes: "",
      equipmentId: "",
      dueOn: "2024-01-31",
      frequency: "monthly",
      interval: "1",
      recurrenceMode: "fixed",
    });
    const [task] = await database.select().from(schema.maintenance);
    await completeTask(
      database,
      "member",
      "home",
      task.id,
      "Europe/Zurich",
      "Remplacé",
      task.dueOn,
    );
    const [updated] = await database.select().from(schema.maintenance);
    expect(updated.dueOn > today("Europe/Zurich")).toBe(true);
    expect(updated.anchorDay).toBe(31);
    await expect(
      completeTask(
        database,
        "member",
        "home",
        task.id,
        "Europe/Zurich",
        "",
        task.dueOn,
      ),
    ).rejects.toThrow("planning a changé");
    expect(
      (await database.select().from(schema.intervention))[0],
    ).toMatchObject({
      notes: "Remplacé",
      scheduledOn: "2024-01-31",
      completedBy: "member",
    });
    await expect(
      completeTask(
        database,
        "member",
        "foreign",
        task.id,
        "UTC",
        "",
        task.dueOn,
      ),
    ).rejects.toThrow();
    await saveEntity(database, "member", "home", "maintenance", "", {
      title: "Inspection",
      notes: "",
      equipmentId: "",
      dueOn: today("UTC"),
      frequency: "once",
      interval: "1",
      recurrenceMode: "completion",
    });
    const [once] = await database
      .select()
      .from(schema.maintenance)
      .where(eq(schema.maintenance.title, "Inspection"));
    await completeTask(
      database,
      "member",
      "home",
      once.id,
      "UTC",
      "",
      once.dueOn,
    );
    await expect(
      completeTask(database, "member", "home", once.id, "UTC", "", once.dueOn),
    ).rejects.toThrow("indisponible");
  });
  it("shares lists, toggles atomically and cascades deletion without crossing households", async () => {
    await saveEntity(database, "member", "home", "shoppingList", "", {
      name: "Marché",
    });
    const [list] = await database.select().from(schema.shoppingList);
    await saveEntity(database, "member", "home", "shoppingItem", "", {
      name: "Piles",
      quantity: "4",
      listId: list.id,
      equipmentId: "",
      maintenanceId: "",
    });
    const [item] = await database.select().from(schema.shoppingItem);
    await expect(
      changeEntity(
        database,
        "member",
        "foreign",
        "shoppingItem",
        item.id,
        "toggle",
      ),
    ).rejects.toThrow();
    await changeEntity(
      database,
      "member",
      "home",
      "shoppingItem",
      item.id,
      "toggle",
    );
    expect((await database.select().from(schema.shoppingItem))[0].checked).toBe(
      true,
    );
    await changeEntity(
      database,
      "member",
      "home",
      "shoppingList",
      list.id,
      "delete",
    );
    expect(await database.select().from(schema.shoppingItem)).toHaveLength(0);
  });
});
describe("Dates civiles et récurrences", () => {
  it("preserves month-end anchors and leap years without timezone drift", () => {
    expect(nextDue("2024-01-31", "monthly", 1, 31)).toBe("2024-02-29");
    expect(nextDue("2024-02-29", "monthly", 1, 31)).toBe("2024-03-31");
    expect(nextDue("2024-02-29", "yearly", 1, 29)).toBe("2025-02-28");
    expect(nextDue("2026-03-28", "weekly", 1, 28)).toBe("2026-04-04");
    expect(today("Europe/Zurich", new Date("2026-03-29T22:30:00Z"))).toBe(
      "2026-03-30",
    );
    expect(dateSchema.safeParse("2026-02-30").success).toBe(false);
  });
});
describe("Fichiers privés", () => {
  it("checks signatures and limits, ignores filenames for storage and rejects traversal", async () => {
    expect(() => detectMime(Buffer.from("<script>alert(1)</script>"))).toThrow(
      "Format",
    );
    const file = new File(["%PDF-1.7\nTest"], "../../secret.pdf", {
      type: "text/html",
    });
    const stored = await saveFile(file);
    expect(stored.mime).toBe("application/pdf");
    expect((await readPrivateFile(stored.storageKey)).toString()).toContain(
      "%PDF",
    );
    await expect(readPrivateFile("../../secret")).rejects.toThrow("invalide");
    await expect(saveFile(file, true)).rejects.toThrow("image");
    await expect(
      saveFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf")),
    ).rejects.toThrow("10 Mo");
    await removePrivateFile(stored.storageKey);
  });
});
