import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import * as s from "@/db/schema";
import type { db as productionDb } from "@/db";
import {
  saveEntity,
  changeEntity,
  setShoppingChecked,
  recordPastIntervention,
  completeTask,
} from "@/lib/home-domain";
import { applyShoppingMutation } from "@/lib/shopping-domain";
import { saveFile, readPrivateFile } from "@/lib/files";
import { exportBackup, importBackup, inspectBackup } from "@/lib/backup";
import { issueReset, resetPassword, recoveryAllowed } from "@/lib/recovery";
import { tokenHash } from "@/lib/domain";
import { queueReminders, deliverReminder } from "@/lib/reminders";
import { projectShopping, type ShoppingState } from "@/lib/offline-shopping";
const pg = new PGlite();
const db = drizzle(pg, { schema: s }) as unknown as typeof productionDb;
let dir: string;
const home = randomUUID();
const foreign = randomUUID();
beforeAll(async () => {
  await migrate(drizzle(pg), { migrationsFolder: "./drizzle" });
  await db.insert(s.household).values([
    { id: home, name: "Maison" },
    { id: foreign, name: "Autre" },
  ]);
  await db.insert(s.user).values([
    { id: "a", name: "Alice", email: "alice@example.test" },
    { id: "b", name: "Bob", email: "bob@example.test" },
  ]);
  await db.insert(s.membership).values([
    { userId: "a", householdId: home, role: "admin" },
    { userId: "b", householdId: home, role: "member" },
  ]);
  dir = await mkdtemp(join(tmpdir(), "lehub-workflows-"));
  process.env.DOCUMENTS_DIR = dir;
});
afterAll(async () => {
  await pg.close();
  await rm(dir, { recursive: true, force: true });
  delete process.env.DOCUMENTS_DIR;
});
it("preserves the 31st anchor on a notes-only edit and rejects stale planning", async () => {
  const id = randomUUID();
  await db.insert(s.maintenance).values({
    id,
    householdId: home,
    title: "Filtre",
    dueOn: "2026-02-28",
    frequency: "monthly",
    anchorDay: 31,
  });
  const data = {
    title: "Filtre",
    notes: "Nouvelles consignes",
    equipmentId: "",
    dueOn: "2026-02-28",
    frequency: "monthly",
    interval: 1,
    recurrenceMode: "fixed",
    revision: 0,
  };
  await saveEntity(db, "a", home, "maintenance", id, data);
  const [task] = await db
    .select()
    .from(s.maintenance)
    .where(eq(s.maintenance.id, id));
  expect(task.anchorDay).toBe(31);
  await expect(
    saveEntity(db, "b", home, "maintenance", id, {
      ...data,
      notes: "Ancien formulaire",
    }),
  ).rejects.toThrow("modifié");
  await completeTask(db, "a", home, id, "UTC", "", task.dueOn, { revision: 1 });
  expect(
    (
      await db.select().from(s.maintenance).where(eq(s.maintenance.id, id))
    )[0].dueOn.endsWith("-31"),
  ).toBe(true);
});
it("records past work, author and exact cents without shifting planning", async () => {
  const id = randomUUID();
  await db.insert(s.maintenance).values({
    id,
    householdId: home,
    title: "Inspection",
    dueOn: "2028-01-01",
    anchorDay: 1,
  });
  await recordPastIntervention(db, "b", home, id, "UTC", {
    revision: 0,
    completedOn: "2025-10-01",
    scheduledOn: "2025-10-02",
    cost: "19,95",
    notes: "Contrôle ancien",
  });
  expect(
    (await db.select().from(s.maintenance).where(eq(s.maintenance.id, id)))[0]
      .dueOn,
  ).toBe("2028-01-01");
  expect(
    (
      await db
        .select()
        .from(s.intervention)
        .where(eq(s.intervention.maintenanceId, id))
    )[0],
  ).toMatchObject({
    completedBy: "b",
    costCents: 1995,
    taskTitle: "Inspection",
  });
});
it("skips an occurrence and keeps the planning anchor", async () => {
  const id = randomUUID();
  await db.insert(s.maintenance).values({
    id,
    householdId: home,
    title: "Saut",
    dueOn: "2028-02-29",
    frequency: "monthly",
    anchorDay: 31,
  });
  await completeTask(db, "a", home, id, "UTC", "Absence", "2028-02-29", {
    revision: 0,
    outcome: "skipped",
  });
  expect(
    (await db.select().from(s.maintenance).where(eq(s.maintenance.id, id)))[0]
      .dueOn,
  ).toBe("2028-03-31");
  expect(
    (
      await db
        .select()
        .from(s.intervention)
        .where(eq(s.intervention.maintenanceId, id))
    )[0].outcome,
  ).toBe("skipped");
});
it("checks explicitly across members, deduplicates offline replay and restores removed items", async () => {
  const list = randomUUID(),
    item = randomUUID();
  await db
    .insert(s.shoppingList)
    .values({ id: list, householdId: home, name: "Marché" });
  await db
    .insert(s.shoppingItem)
    .values({ id: item, householdId: home, listId: list, name: "Lait" });
  await setShoppingChecked(db, "a", home, item, true);
  await setShoppingChecked(db, "b", home, item, true);
  expect(
    (
      await db.select().from(s.shoppingItem).where(eq(s.shoppingItem.id, item))
    )[0].checked,
  ).toBe(true);
  const mutation = {
    kind: "edit",
    mutationId: randomUUID(),
    id: item,
    revision: 2,
    data: {
      name: "Lait frais",
      quantity: "3",
      category: "Frais",
      listId: list,
      equipmentId: "",
      maintenanceId: "",
    },
  };
  await applyShoppingMutation(db, "a", home, mutation);
  await applyShoppingMutation(db, "a", home, mutation);
  await expect(
    applyShoppingMutation(db, "b", home, {
      ...mutation,
      mutationId: randomUUID(),
    }),
  ).rejects.toThrow("modifié");
  await changeEntity(db, "a", home, "shoppingItem", item, "delete", 3);
  await changeEntity(db, "a", home, "shoppingItem", item, "undo", 4);
  expect(
    (
      await db.select().from(s.shoppingItem).where(eq(s.shoppingItem.id, item))
    )[0],
  ).toMatchObject({
    name: "Lait frais",
    quantity: "3",
    category: "Frais",
    deletedAt: null,
  });
});
it("projects queued offline changes in order including undo", () => {
  const id = randomUUID();
  const state: ShoppingState = {
    scope: "a:home",
    owner: "Alice",
    household: "Maison",
    lists: [{ id: "list", name: "Marché", revision: 0 }],
    items: [],
  };
  const projected = projectShopping(state, [
    {
      kind: "add",
      id,
      mutationId: "1",
      data: { name: "Pain", quantity: "1", category: "Frais", listId: "list" },
    },
    { kind: "checked", id, mutationId: "2", checked: true },
    { kind: "delete", id, mutationId: "3", revision: 1 },
    { kind: "undo", id, mutationId: "4", revision: 2 },
  ]);
  expect(projected.items[0]).toMatchObject({
    name: "Pain",
    checked: true,
    deletedAt: null,
    revision: 3,
  });
  expect(state.items).toHaveLength(0);
});
it("backs up originals, validates links and restores without touching another household", async () => {
  const original = await saveFile(
    new File(["%PDF-1.7\noriginal"], "notice.pdf"),
  );
  const id = randomUUID();
  await db.insert(s.document).values({
    id,
    householdId: home,
    title: "Notice",
    category: "manual",
    originalName: "notice.pdf",
    ...original,
  });
  await db
    .insert(s.room)
    .values({ id: randomUUID(), householdId: foreign, name: "Secret" });
  const zip = await exportBackup(db, "a", home);
  const { data, zip: archive } = inspectBackup(zip);
  expect(
    archive.getEntry(data.documents[0].file)!.getData().toString(),
  ).toContain("original");
  expect(
    (data.documents[0] as unknown as { storageKey?: string }).storageKey,
  ).toBeUndefined();
  await expect(importBackup(db, "b", home, zip)).rejects.toThrow(
    "non autorisée",
  );
  await importBackup(db, "a", home, zip);
  const [restored] = await db
    .select()
    .from(s.document)
    .where(eq(s.document.householdId, home));
  expect(restored.id).not.toBe(id);
  expect((await readPrivateFile(restored.storageKey)).toString()).toContain(
    "original",
  );
  expect(
    (await db.select().from(s.room).where(eq(s.room.householdId, foreign)))[0]
      .name,
  ).toBe("Secret");
  const bad = new AdmZip(zip);
  const manifest = JSON.parse(
    bad.getEntry("manifest.json")!.getData().toString(),
  );
  manifest.documents[0].equipmentId = randomUUID();
  bad.updateFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
  expect(() => inspectBackup(bad.toBuffer())).toThrow("Association");
  bad.addFile("../secret", Buffer.from("bad"));
  expect(() => inspectBackup(bad.toBuffer())).toThrow("Archive");
});
it("reset links are hashed, single-use, expire and revoke sessions", async () => {
  await db.insert(s.account).values({
    id: "credential-a",
    accountId: "a",
    providerId: "credential",
    userId: "a",
    password: "old",
  });
  await db.insert(s.session).values({
    id: "session-a",
    token: "session-token",
    userId: "a",
    expiresAt: new Date(Date.now() + 60000),
  });
  const token = (await issueReset(db, "alice@example.test"))!;
  expect((await db.select().from(s.passwordReset))[0].tokenHash).toBe(
    tokenHash(token),
  );
  await resetPassword(db, token, "a-new-long-password");
  expect(await db.select().from(s.session)).toHaveLength(0);
  await expect(
    resetPassword(db, token, "another-long-password"),
  ).rejects.toThrow("expiré");
  const expired = (await issueReset(db, "alice@example.test"))!;
  await db.update(s.passwordReset).set({ expiresAt: new Date(0) });
  await expect(
    resetPassword(db, expired, "another-long-password"),
  ).rejects.toThrow("expiré");
  expect(await issueReset(db, "missing@example.test")).toBeNull();
  expect(await recoveryAllowed(db, "alice")).toBe(true);
  await recoveryAllowed(db, "alice");
  await recoveryAllowed(db, "alice");
  expect(await recoveryAllowed(db, "alice")).toBe(false);
});
it("reminders deduplicate, retry and cancel after opt-out", async () => {
  await db.insert(s.reminderPreference).values({
    householdId: home,
    userId: "a",
    emailEnabled: true,
    leadDays: 7,
  });
  const task = randomUUID();
  await db.insert(s.maintenance).values({
    id: task,
    householdId: home,
    title: "À rappeler",
    dueOn: "2026-01-15",
    anchorDay: 15,
  });
  await queueReminders(db, new Date("2026-01-10T12:00:00Z"));
  await queueReminders(db, new Date("2026-01-10T12:00:00Z"));
  const queued = await db
    .select()
    .from(s.reminderDelivery)
    .where(eq(s.reminderDelivery.targetId, task));
  expect(queued).toHaveLength(1);
  await deliverReminder(db, async () => {
    throw Error("SMTP temporarily down");
  });
  expect((await db.select().from(s.reminderDelivery))[0].status).toBe("failed");
  await db.update(s.reminderDelivery).set({ nextAttemptAt: new Date(0) });
  let sent = 0;
  await deliverReminder(db, async () => {
    sent++;
  });
  expect(sent).toBe(1);
  await db.update(s.reminderPreference).set({ emailEnabled: false });
  await db
    .update(s.reminderDelivery)
    .set({ status: "pending" })
    .where(eq(s.reminderDelivery.targetId, task));
  await deliverReminder(db, async () => {
    sent++;
  });
  expect(sent).toBe(1);
});

it("renames, reassociates, replaces and restores private originals with stale-version protection", async () => {
  const { uploadDocument, replaceDocument } =
    await import("@/lib/document-domain");
  await uploadDocument(
    "a",
    home,
    {
      title: "Document à corriger",
      category: "invoice",
      equipmentId: "",
      tags: "garantie",
    },
    new File(["%PDF-1.7\nancien"], "ancien.pdf"),
    db,
  );
  const [doc] = await db
    .select()
    .from(s.document)
    .where(eq(s.document.title, "Document à corriger"));
  await saveEntity(db, "a", home, "document", doc.id, {
    revision: 0,
    title: "Document corrigé",
    category: "manual",
    equipmentId: "",
    tags: "notice",
  });
  await expect(
    replaceDocument(
      "b",
      home,
      doc.id,
      0,
      new File(["%PDF-1.7\nincorrect"], "incorrect.pdf"),
      db,
    ),
  ).rejects.toThrow("modifié");
  await replaceDocument(
    "b",
    home,
    doc.id,
    1,
    new File(["%PDF-1.7\nnouveau"], "nouveau.pdf"),
    db,
  );
  await expect(readPrivateFile(doc.storageKey)).rejects.toThrow();
  let [updated] = await db
    .select()
    .from(s.document)
    .where(eq(s.document.id, doc.id));
  expect((await readPrivateFile(updated.storageKey)).toString()).toContain(
    "nouveau",
  );
  expect(updated.title).toBe("Document corrigé");
  await expect(
    saveEntity(db, "a", home, "document", doc.id, {
      revision: 2,
      title: "Photo invalide",
      category: "photo",
      equipmentId: "",
      tags: "",
    }),
  ).rejects.toThrow("photo");
  await changeEntity(db, "a", home, "document", doc.id, "delete", 2);
  await changeEntity(db, "a", home, "document", doc.id, "undo", 3);
  [updated] = await db
    .select()
    .from(s.document)
    .where(eq(s.document.id, doc.id));
  expect(updated.deletedAt).toBeNull();
});

it("extracts searchable text from an original PDF with local Poppler", async () => {
  const parts = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream =
    "BT /F1 18 Tf 40 740 Td (GARANTIE LEHUB NUMERO 123456 VALABLE 24 MOIS) Tj ET";
  parts.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  parts.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  const file = await saveFile(new File([pdf], "texte.pdf"));
  const { extractText } = await import("@/lib/ocr");
  expect(await extractText(file.storageKey, file.mime)).toContain(
    "GARANTIE LEHUB",
  );
});
