// Explicit disposable PostgreSQL database; never migrate or clear the supplied database.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { randomUUID } from "node:crypto";
import webpush from "web-push";
import { subscribePush } from "../src/lib/push";
import { deliverReminder } from "../src/lib/reminders";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import {
  saveEntity,
  completeTask,
  setShoppingChecked,
  changeEntity,
  postponeTask,
} from "../src/lib/home-domain";
import { applyShoppingMutation } from "../src/lib/shopping-domain";
import { manageMember } from "../src/lib/domain";
import { correctIntervention } from "../src/lib/operations";
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
  await da.insert(schema.maintenance).values({
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
  const [history] = await da.select().from(schema.intervention);
  const correction = {
    revision: history.revision,
    completedOn: history.completedOn,
    scheduledOn: history.scheduledOn,
    notes: "Corrigée",
    cost: "15",
    outcome: "completed",
  };
  const historyEdits = await Promise.allSettled([
    correctIntervention(da, "a", home, history.id, correction, "UTC"),
    correctIntervention(db, "b", home, history.id, correction, "UTC"),
  ]);
  assert.equal(historyEdits.filter((r) => r.status === "fulfilled").length, 1);
  await da
    .update(schema.membership)
    .set({ role: "admin" })
    .where(eq(schema.membership.householdId, home));
  const roles = await Promise.allSettled([
    manageMember(da, "a", home, "a", "member"),
    manageMember(db, "b", home, "b", "member"),
  ]);
  assert.equal(roles.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (
      await da
        .select()
        .from(schema.membership)
        .where(eq(schema.membership.householdId, home))
    ).filter((m) => m.role === "admin").length,
    1,
  );
  const [trace] = await da
    .select()
    .from(schema.interventionCorrection)
    .where(eq(schema.interventionCorrection.interventionId, history.id));
  assert.ok(trace);
  assert.equal(
    (
      await da
        .select()
        .from(schema.interventionCorrection)
        .where(eq(schema.interventionCorrection.interventionId, history.id))
    ).length,
    1,
  );
  for (const actor of ["a", "b"])
    await da
      .insert(schema.session)
      .values({
        id: `session-${actor}`,
        userId: actor,
        token: `session-${actor}`,
        expiresAt: new Date(Date.now() + 86400000),
      });
  const subscription = (id: string) => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
    keys: {
      p256dh: Buffer.alloc(65).toString("base64url"),
      auth: Buffer.alloc(16).toString("base64url"),
    },
  });
  await Promise.all([
    subscribePush(da, "a", home, subscription("shared"), "session-a"),
    subscribePush(db, "b", home, subscription("shared"), "session-b"),
  ]);
  assert.equal((await da.select().from(schema.pushSubscription)).length, 1);
  await da.delete(schema.pushSubscription);
  await subscribePush(da, "a", home, subscription("good"), "session-a");
  await subscribePush(da, "a", home, subscription("bad"), "session-a");
  const pushTask = randomUUID(),
    pushDelivery = randomUUID();
  await da
    .insert(schema.maintenance)
    .values({
      id: pushTask,
      householdId: home,
      title: "Push concurrence",
      dueOn: date,
      anchorDay: 1,
    });
  await da
    .insert(schema.reminderDelivery)
    .values({
      id: pushDelivery,
      householdId: home,
      userId: "a",
      kind: "maintenance",
      targetId: pushTask,
      dueOn: date,
      channel: "push",
    });
  const originalSend = webpush.sendNotification;
  const originalEnv = { ...process.env };
  const calls: string[] = [];
  let failed = false;
  try {
    process.env.VAPID_PUBLIC_KEY =
      process.env.VAPID_PRIVATE_KEY =
      process.env.VAPID_SUBJECT =
        "local-mocked-provider";
    webpush.sendNotification = async (device) => {
      calls.push(device.endpoint);
      if (device.endpoint.endsWith("bad") && !failed) {
        failed = true;
        throw Object.assign(Error("temporary"), { statusCode: 503 });
      }
      return { statusCode: 201, body: "", headers: {} };
    };
    await Promise.all([deliverReminder(da), deliverReminder(db)]);
    assert.equal(
      (
        await da
          .select()
          .from(schema.reminderDelivery)
          .where(eq(schema.reminderDelivery.id, pushDelivery))
      )[0].status,
      "failed",
    );
    assert.equal(
      (
        await da
          .select()
          .from(schema.pushReceipt)
          .where(eq(schema.pushReceipt.deliveryId, pushDelivery))
      ).filter((r) => r.status === "sent").length,
      1,
    );
    await da
      .update(schema.reminderDelivery)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(schema.reminderDelivery.id, pushDelivery));
    await Promise.all([deliverReminder(da), deliverReminder(db)]);
    assert.equal(calls.filter((e) => e.endsWith("good")).length, 1);
    assert.equal(calls.filter((e) => e.endsWith("bad")).length, 2);
    assert.equal(
      (
        await da
          .select()
          .from(schema.reminderDelivery)
          .where(eq(schema.reminderDelivery.id, pushDelivery))
      )[0].status,
      "sent",
    );
  } finally {
    webpush.sendNotification = originalSend;
    for (const key of [
      "VAPID_PUBLIC_KEY",
      "VAPID_PRIVATE_KEY",
      "VAPID_SUBJECT",
    ]) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
  const moved = randomUUID();
  await da
    .insert(schema.maintenance)
    .values({
      id: moved,
      householdId: home,
      title: "Déplacement concurrent",
      dueOn: "2026-02-28",
      frequency: "monthly",
      anchorDay: 31,
    });
  const moves = await Promise.allSettled([
    postponeTask(da, "a", home, moved, 0, "2026-03-04"),
    postponeTask(db, "b", home, moved, 0, "2026-03-05"),
  ]);
  assert.equal(
    moves.filter((result) => result.status === "fulfilled").length,
    1,
  );
  const [movedTask] = await da
    .select()
    .from(schema.maintenance)
    .where(eq(schema.maintenance.id, moved));
  assert.equal(movedTask.revision, 1);
  assert.equal(movedTask.anchorDay, 31);
  console.log(
    "PostgreSQL réel : 10 scénarios de concurrence validés, deux connexions et deux membres.",
  );
} finally {
  await Promise.all(pools.map((p) => p.end()));
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
}
