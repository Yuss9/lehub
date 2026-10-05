import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, afterAll, it, expect } from "vitest";
import * as s from "@/db/schema";
import type { db as productionDb } from "@/db";
import { manageMember, createHousehold, updateHousehold } from "@/lib/domain";
import {
  correctIntervention,
  retryReminder,
  claimMailTest,
} from "@/lib/operations";
import { finishRecognition } from "@/lib/document-processing";
import { subscribePush, unsubscribePush, subscriptionSchema } from "@/lib/push";
const pg = new PGlite();
const db = drizzle(pg, { schema: s }) as unknown as typeof productionDb;
const home = randomUUID();
beforeAll(async () => {
  await migrate(drizzle(pg), { migrationsFolder: "./drizzle" });
  await db.insert(s.user).values([
    { id: "admin", name: "Alice", email: "alice@example.test" },
    { id: "member", name: "Bob", email: "bob@example.test" },
  ]);
  await db.insert(s.household).values({ id: home, name: "Maison" });
  await db.insert(s.membership).values([
    { householdId: home, userId: "admin", role: "admin" },
    { householdId: home, userId: "member", role: "member" },
  ]);
});
afterAll(() => pg.close());
it("protects the last admin, promotes a member, and allows a transfer of administration", async () => {
  await expect(
    manageMember(db, "admin", home, "admin", "member"),
  ).rejects.toThrow("au moins un");
  await expect(
    manageMember(db, "member", home, "admin", "member"),
  ).rejects.toThrow();
  await manageMember(db, "admin", home, "member", "admin");
  await manageMember(db, "admin", home, "admin", "member");
  await expect(
    manageMember(db, "admin", home, "member", "member"),
  ).rejects.toThrow();
  await expect(
    manageMember(db, "member", home, "member", "remove"),
  ).rejects.toThrow("au moins un");
  await manageMember(db, "member", home, "admin", "admin");
  await manageMember(db, "admin", home, "member", "member");
});
it("creates another household for an existing account with isolated administration", async () => {
  const id = await createHousehold(db, "member", {
    name: "Deuxième maison",
    currency: "EUR",
    timezone: "Europe/Paris",
  });
  const rows = await db
    .select()
    .from(s.membership)
    .where(eq(s.membership.householdId, id));
  expect(rows).toHaveLength(1);
  expect(rows[0].role).toBe("admin");
  expect(rows[0].userId).toBe("member");
});
it("rejects stale household configuration", async () => {
  const data = {
    revision: 0,
    name: "Maison",
    currency: "EUR",
    timezone: "Europe/Paris",
  };
  await updateHousehold(db, "admin", home, data);
  await expect(updateHousehold(db, "admin", home, data)).rejects.toThrow(
    "ont changé",
  );
});
it("corrects or cancels history without modifying the planning, and rejects a stale correction", async () => {
  const task = randomUUID(),
    id = randomUUID();
  await db.insert(s.maintenance).values({
    id: task,
    householdId: home,
    title: "Filtre",
    dueOn: "2027-01-31",
    anchorDay: 31,
  });
  await db.insert(s.intervention).values({
    id,
    householdId: home,
    maintenanceId: task,
    completedOn: "2026-01-01",
    scheduledOn: "2026-01-01",
    completedBy: "admin",
    costCents: 100,
  });
  const data = {
    revision: 0,
    completedOn: "2026-01-02",
    scheduledOn: "2026-01-01",
    cost: "4,50",
    notes: "Corrigée",
    outcome: "cancelled",
  };
  await correctIntervention(db, "member", home, id, data, "Europe/Paris");
  await expect(
    correctIntervention(db, "member", home, id, data, "Europe/Paris"),
  ).rejects.toThrow("a changé");
  const [entry] = await db
    .select()
    .from(s.intervention)
    .where(eq(s.intervention.id, id));
  expect(entry.costCents).toBe(450);
  expect(entry.completedBy).toBe("admin");
  expect(
    (await db.select().from(s.maintenance).where(eq(s.maintenance.id, task)))[0]
      .dueOn,
  ).toBe("2027-01-31");
});
it("retries an exhausted delivery with admin authorization and enforces a shared SMTP cooldown", async () => {
  const id = randomUUID();
  await db.insert(s.reminderDelivery).values({
    id,
    householdId: home,
    userId: "admin",
    kind: "maintenance",
    targetId: randomUUID(),
    dueOn: "2026-01-01",
    attempts: 5,
    status: "failed",
  });
  await expect(retryReminder(db, "member", home, id)).rejects.toThrow();
  await retryReminder(db, "admin", home, id);
  expect(
    (
      await db
        .select()
        .from(s.reminderDelivery)
        .where(eq(s.reminderDelivery.id, id))
    )[0].attempts,
  ).toBe(0);
  await claimMailTest(db, "admin");
  await expect(claimMailTest(db, "admin")).rejects.toThrow("minute");
});
it("an OCR result cannot overwrite a manual correction or a newer processing lease", async () => {
  const id = randomUUID(),
    started = new Date();
  await db.insert(s.document).values({
    id,
    householdId: home,
    title: "Notice",
    category: "manual",
    originalName: "n.pdf",
    mime: "application/pdf",
    size: 10,
    storageKey: randomUUID(),
    ocrStatus: "processing",
    ocrStartedAt: started,
  });
  const [job] = await db.select().from(s.document).where(eq(s.document.id, id));
  await db
    .update(s.document)
    .set({
      extractedText: "Correction humaine",
      revision: 1,
      ocrStatus: "manual",
    })
    .where(eq(s.document.id, id));
  expect(await finishRecognition(db, job, "Ancien OCR", false)).toHaveLength(0);
  expect(
    (await db.select().from(s.document).where(eq(s.document.id, id)))[0]
      .extractedText,
  ).toBe("Correction humaine");
});
it("validates push endpoints against SSRF and scopes subscriptions to their member/household", async () => {
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    keys: {
      p256dh: Buffer.alloc(65).toString("base64url"),
      auth: Buffer.alloc(16).toString("base64url"),
    },
  };
  expect(
    subscriptionSchema.safeParse({
      ...subscription,
      endpoint: "https://127.0.0.1/private",
    }).success,
  ).toBe(false);
  expect(
    subscriptionSchema.safeParse({
      ...subscription,
      endpoint: "https://fcm.googleapis.com:444/private",
    }).success,
  ).toBe(false);
  await subscribePush(db, "member", home, subscription);
  await subscribePush(db, "member", home, subscription);
  expect(await db.select().from(s.pushSubscription)).toHaveLength(1);
  await expect(
    subscribePush(db, "outsider", home, subscription),
  ).rejects.toThrow();
  await unsubscribePush(db, "member", home, subscription.endpoint);
  expect(await db.select().from(s.pushSubscription)).toHaveLength(0);
  expect(
    (
      await db
        .select()
        .from(s.reminderPreference)
        .where(eq(s.reminderPreference.userId, "member"))
    )[0].pushEnabled,
  ).toBe(false);
});

it("distributes push independently of an SMTP failure and deduplicates each channel", async () => {
  const { queueReminders, deliverReminder } = await import("@/lib/reminders");
  const target = randomUUID();
  await db
    .insert(s.maintenance)
    .values({
      id: target,
      householdId: home,
      title: "Deux canaux",
      dueOn: "2020-01-01",
      anchorDay: 1,
    });
  await db
    .insert(s.reminderPreference)
    .values({
      householdId: home,
      userId: "admin",
      emailEnabled: true,
      pushEnabled: true,
    });
  await queueReminders(db);
  await queueReminders(db);
  expect(
    await db
      .select()
      .from(s.reminderDelivery)
      .where(eq(s.reminderDelivery.targetId, target)),
  ).toHaveLength(2);
  let pushes = 0;
  while (
    await deliverReminder(
      db,
      async () => {
        throw Error("SMTP down");
      },
      async () => {
        pushes++;
      },
    )
  ) {
    /* drain ready jobs */
  }
  const deliveries = await db
    .select()
    .from(s.reminderDelivery)
    .where(eq(s.reminderDelivery.targetId, target));
  expect(deliveries.find((d) => d.channel === "email")?.status).toBe("failed");
  expect(deliveries.find((d) => d.channel === "push")?.status).toBe("sent");
  expect(pushes).toBe(1);
});
