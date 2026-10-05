import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, afterAll, afterEach, it, expect, vi } from "vitest";
import webpush from "web-push";
import * as s from "@/db/schema";
import type { db as productionDb } from "@/db";
import { subscribePush, unsubscribePush, sendPush } from "@/lib/push";
import { revokeAccountAccess } from "@/lib/account-security";
import { correctIntervention, workerHeartbeat } from "@/lib/operations";
import { deliverReminder } from "@/lib/reminders";
import { processOcrBatch } from "@/lib/document-processing";
import { workerHealth } from "@/lib/operations-health";
import { monitorOperations } from "@/lib/operations-monitor";
import { exportBackup, importBackup, inspectBackup } from "@/lib/backup";
const pg = new PGlite();
const db = drizzle(pg, { schema: s }) as unknown as typeof productionDb;
const home = randomUUID();
const endpoint = (id: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${id}`, keys: { p256dh: Buffer.alloc(65).toString("base64url"), auth: Buffer.alloc(16).toString("base64url") } });
async function createSession(actor: string, id: string) { await db.insert(s.session).values({ id, userId: actor, token: id, expiresAt: new Date(Date.now() + 86400000) }); }
beforeAll(async () => {
  await migrate(drizzle(pg), { migrationsFolder: "./drizzle" });
  await db.insert(s.user).values([{ id: "a", name: "Alice", email: "a@example.test" }, { id: "b", name: "Bob", email: "b@example.test" }]);
  await db.insert(s.household).values({ id: home, name: "Maison" });
  await db.insert(s.membership).values([{ householdId: home, userId: "a", role: "admin" }, { householdId: home, userId: "b", role: "member" }]);
  await createSession("a", "a-current"); await createSession("b", "b-current");
});
afterAll(() => pg.close());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("retires all households on logout, transfers a shared endpoint, and rejects an expired session", async () => {
  const other = randomUUID();
  await db.insert(s.household).values({ id: other, name: "Autre" });
  await db.insert(s.membership).values({ householdId: other, userId: "a", role: "admin" });
  await createSession("a", "logout");
  await subscribePush(db, "a", home, endpoint("logout"), "logout");
  await subscribePush(db, "a", other, endpoint("logout"), "logout");
  await db.delete(s.session).where(eq(s.session.id, "logout"));
  expect(await db.select().from(s.pushSubscription)).toHaveLength(0);
  await subscribePush(db, "a", home, endpoint("shared"), "a-current");
  await subscribePush(db, "b", home, endpoint("shared"), "b-current");
  const devices = await db.select().from(s.pushSubscription);
  expect(devices).toHaveLength(1); expect(devices[0].userId).toBe("b");
  await expect(subscribePush(db, "a", home, endpoint("invalid"), "logout")).rejects.toThrow("Session expirée");
});
it("restricts session/device revocations to their owner and removes linked subscriptions", async () => {
  await createSession("a", "remote");
  await subscribePush(db, "a", home, endpoint("remote"), "remote");
  await expect(revokeAccountAccess(db, "b", "b-current", "session", "remote")).rejects.toThrow();
  await expect(revokeAccountAccess(db, "a", "a-current", "session", "a-current")).rejects.toThrow();
  await revokeAccountAccess(db, "a", "a-current", "session", "remote");
  expect(await db.select().from(s.pushSubscription).where(eq(s.pushSubscription.sessionId, "remote"))).toHaveLength(0);
  const [device] = await db.select().from(s.pushSubscription).where(eq(s.pushSubscription.userId, "b"));
  await expect(revokeAccountAccess(db, "a", "a-current", "device", device.id)).rejects.toThrow();
  await revokeAccountAccess(db, "b", "b-current", "device", device.id);
});
it("retries only a failed push device and persists receipts when the parent reminder fails", async () => {
  for (const key of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]) vi.stubEnv(key, "local-mocked-value");
  await subscribePush(db, "a", home, endpoint("good"), "a-current");
  await createSession("a", "second-device");
  await subscribePush(db, "a", home, endpoint("bad"), "second-device");
  const task = randomUUID(), delivery = randomUUID();
  await db.insert(s.maintenance).values({ id: task, householdId: home, title: "Filtre", dueOn: "2026-01-01", anchorDay: 1 });
  await db.insert(s.reminderDelivery).values({ id: delivery, householdId: home, userId: "a", kind: "maintenance", targetId: task, dueOn: "2026-01-01", channel: "push" });
  let failedOnce = false;
  const send = vi.spyOn(webpush, "sendNotification").mockImplementation(async (subscription) => {
    if (subscription.endpoint.endsWith("/bad") && !failedOnce) { failedOnce = true; throw Object.assign(Error("temporary"), { statusCode: 503 }); }
    return { statusCode: 201, body: "", headers: {} };
  });
  await deliverReminder(db);
  expect((await db.select().from(s.reminderDelivery).where(eq(s.reminderDelivery.id, delivery)))[0].status).toBe("failed");
  const receipts = await db.select().from(s.pushReceipt).where(eq(s.pushReceipt.deliveryId, delivery));
  expect(receipts.map((r) => r.status).sort()).toEqual(["failed", "sent"]);
  // Re-enabling the same browser creates a new subscription row, but its
  // already accepted receipt must still prevent a duplicate notification.
  await unsubscribePush(db, "a", home, endpoint("good").endpoint);
  await subscribePush(db, "a", home, endpoint("good"), "a-current");
  await db.update(s.reminderDelivery).set({ nextAttemptAt: new Date(0) }).where(eq(s.reminderDelivery.id, delivery));
  await deliverReminder(db);
  expect((await db.select().from(s.reminderDelivery).where(eq(s.reminderDelivery.id, delivery)))[0].status).toBe("sent");
  expect(send.mock.calls.filter(([sub]) => sub.endpoint.endsWith("/good"))).toHaveLength(1);
  expect(send.mock.calls.filter(([sub]) => sub.endpoint.endsWith("/bad"))).toHaveLength(2);
  await db.delete(s.session).where(eq(s.session.id, "second-device"));
  await db.update(s.session).set({ expiresAt: new Date(0) }).where(eq(s.session.id, "a-current"));
  send.mockClear();
  await expect(sendPush(db, "a", home)).rejects.toThrow("Aucun appareil"); expect(send).not.toHaveBeenCalled();
  await db.update(s.session).set({ expiresAt: new Date(Date.now() + 86400000) }).where(eq(s.session.id, "a-current"));
});
it("records atomic before/after corrections, rejects stale edits, and preserves the trace in ZIP restore", async () => {
  const task = randomUUID(), entry = randomUUID();
  await db.insert(s.maintenance).values({ id: task, householdId: home, title: "Historique", dueOn: "2027-01-31", anchorDay: 31 });
  await db.insert(s.intervention).values({ id: entry, maintenanceId: task, householdId: home, completedOn: "2026-01-01", scheduledOn: "2026-01-01", costCents: 100, completedBy: "a" });
  const change = { revision: 0, completedOn: "2026-01-02", scheduledOn: "2026-01-01", notes: "Correction", cost: "4,50", outcome: "completed" };
  await correctIntervention(db, "b", home, entry, change, "Europe/Paris");
  await expect(correctIntervention(db, "a", home, entry, change, "Europe/Paris")).rejects.toThrow("a changé");
  const trace = await db.select().from(s.interventionCorrection).where(eq(s.interventionCorrection.interventionId, entry));
  expect(trace).toHaveLength(1); expect(trace[0].actorName).toBe("Bob"); expect(trace[0].before.costCents).toBe(100); expect(trace[0].after.costCents).toBe(450);
  const zip = await exportBackup(db, "a", home);
  expect(inspectBackup(zip).data.corrections).toHaveLength(1);
  await importBackup(db, "a", home, zip);
  const restored = await db.select().from(s.interventionCorrection).where(eq(s.interventionCorrection.householdId, home));
  expect(restored).toHaveLength(1); expect(restored[0].actorName).toBe("Bob"); expect(restored[0].after.costCents).toBe(450);
  expect(restored[0].interventionId).not.toBe(entry);
});
it("handles multiple OCR documents with bounded concurrency and isolates one failure", async () => {
  const keys = Array.from({ length: 5 }, () => randomUUID());
  await db.insert(s.document).values(keys.map((key) => ({ id: key, householdId: home, storageKey: key, title: "Notice", originalName: "notice.pdf", category: "manual", mime: "application/pdf", size: 1 })));
  let running = 0, peak = 0;
  const extract = vi.fn(async (key: string) => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running--; if (key === keys[0]) throw Error("bad file"); return "Texte"; });
  expect(await processOcrBatch(db, { batchSize: 4, concurrency: 2 }, extract)).toBe(4);
  expect(peak).toBeLessThanOrEqual(2); expect(extract).toHaveBeenCalledTimes(4);
  await processOcrBatch(db, { batchSize: 4, concurrency: 2 }, extract);
  const docs = await db.select().from(s.document).where(eq(s.document.householdId, home));
  expect(docs.filter((d) => d.ocrStatus === "done")).toHaveLength(4);
  expect(docs.filter((d) => d.ocrStatus === "error")).toHaveLength(1);
});
it("respects a weekly backup schedule and deduplicates alerts with recovery notifications", async () => {
  const now = new Date("2026-10-05T12:00:00Z");
  const weekly = { id: "backup", intervalSeconds: 168 * 3600, heartbeatAt: new Date(now.getTime() - 3 * 86400000), completedAt: new Date(now.getTime() - 3 * 86400000), lastError: "" };
  expect(workerHealth(weekly, now)).toBe("ok"); expect(workerHealth(weekly, new Date(now.getTime() + 5 * 86400000))).toBe("stale");
  const notify = vi.fn(async (message: string) => { expect(message).toContain("lehub"); });
  await monitorOperations(db, notify, now); await monitorOperations(db, notify, new Date(now.getTime() + 60000));
  expect(notify).toHaveBeenCalledTimes(1);
  await workerHeartbeat(db, "worker", { completedAt: now });
  // Use a deterministic signal time, separate from the real clock.
  await db.update(s.workerState).set({ heartbeatAt: now }).where(eq(s.workerState.id, "worker"));
  await monitorOperations(db, notify, now); expect(notify).toHaveBeenCalledTimes(2);
  expect(notify.mock.calls[1][0]).toContain("rétabli");
});
