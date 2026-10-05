// Explicit disposable PostgreSQL database; never migrate or clear the supplied database.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import {
  saveEntity,
  completeTask,
  setShoppingChecked,
  changeEntity,
} from "../src/lib/home-domain";
import { applyShoppingMutation } from "../src/lib/shopping-domain";
import { today } from "../src/lib/recurrence";
const source = process.env.TEST_POSTGRES_URL;
if (!source)
  throw Error(
    "Définis TEST_POSTGRES_URL vers un PostgreSQL de test (droit CREATE DATABASE requis).",
  );
const name = `lehub_concurrency_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: source, max: 1 });
const pools: Pool[] = [];
let created = false;
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  const url = new URL(source);
  url.pathname = `/${name}`;
  const a = new Pool({ connectionString: url.toString(), max: 1 });
  const b = new Pool({ connectionString: url.toString(), max: 1 });
  pools.push(a, b);
  const da = drizzle(a, { schema }),
    db = drizzle(b, { schema });
  await migrate(da, { migrationsFolder: "./drizzle" });
  const home = randomUUID();
  await da.insert(schema.household).values({ id: home, name: "Concurrence" });
  await da.insert(schema.user).values([
    { id: "a", name: "Alice", email: "a@example.test" },
    { id: "b", name: "Bob", email: "b@example.test" },
  ]);
  await da.insert(schema.membership).values([
    { householdId: home, userId: "a" },
    { householdId: home, userId: "b" },
  ]);
  const task = randomUUID();
  const date = today("UTC");
  const planning = {
    title: "Filtre",
    notes: "",
    equipmentId: "",
    dueOn: date,
    frequency: "monthly",
    interval: 1,
    recurrenceMode: "fixed",
    revision: 0,
  };
  await da
    .insert(schema.maintenance)
    .values({
      id: task,
      householdId: home,
      title: "Filtre",
      dueOn: date,
      frequency: "monthly",
      anchorDay: Number(date.slice(8)),
    });
  const edits = await Promise.allSettled([
    saveEntity(da, "a", home, "maintenance", task, {
      ...planning,
      notes: "Alice",
    }),
    saveEntity(db, "b", home, "maintenance", task, {
      ...planning,
      notes: "Bob",
    }),
  ]);
  assert.equal(edits.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(edits.filter((r) => r.status === "rejected").length, 1);
  const validations = await Promise.allSettled([
    completeTask(da, "a", home, task, "UTC", "Alice", date, { revision: 1 }),
    completeTask(db, "b", home, task, "UTC", "Bob", date, { revision: 1 }),
  ]);
  assert.equal(validations.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await da.select().from(schema.intervention)).length, 1);
  const list = randomUUID(),
    item = randomUUID();
  await da
    .insert(schema.shoppingList)
    .values({ id: list, householdId: home, name: "Marché" });
  await da
    .insert(schema.shoppingItem)
    .values({ id: item, householdId: home, listId: list, name: "Lait" });
  await Promise.all([
    setShoppingChecked(da, "a", home, item, true),
    setShoppingChecked(db, "b", home, item, true),
  ]);
  assert.equal(
    (
      await da
        .select()
        .from(schema.shoppingItem)
        .where(eq(schema.shoppingItem.id, item))
    )[0].checked,
    true,
  );
  const mutation = {
    kind: "checked",
    mutationId: randomUUID(),
    id: item,
    checked: false,
  };
  await Promise.all([
    applyShoppingMutation(da, "a", home, mutation),
    applyShoppingMutation(db, "a", home, mutation),
  ]);
  assert.equal(
    (
      await da
        .select()
        .from(schema.shoppingItem)
        .where(eq(schema.shoppingItem.id, item))
    )[0].revision,
    3,
  );
  const stale = await Promise.allSettled([
    changeEntity(da, "a", home, "shoppingItem", item, "delete", 3),
    saveEntity(db, "b", home, "shoppingItem", item, {
      revision: 3,
      listId: list,
      name: "Lait frais",
      quantity: "2",
      equipmentId: "",
      maintenanceId: "",
      category: "Frais",
    }),
  ]);
  assert.equal(stale.filter((r) => r.status === "fulfilled").length, 1);
  console.log(
    "PostgreSQL réel : 5 scénarios de concurrence validés, deux connexions et deux membres.",
  );
} finally {
  await Promise.all(pools.map((p) => p.end()));
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
