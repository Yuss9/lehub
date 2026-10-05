import AdmZip from "adm-zip";
import { inflateRawSync } from "node:zlib";
import { createHash, randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { db as productionDb } from "@/db";
import {
  room,
  equipment,
  maintenance,
  intervention,
  shoppingList,
  shoppingItem,
  document,
  household,
  reminderDelivery,
  offlineMutation,
} from "@/db/schema";
import { requireMembership, DomainError } from "./domain";
import { schemas } from "./home-domain";
import { dateSchema } from "./recurrence";
import { filePath, saveFile } from "./files";
const MAX_ARCHIVE = 100 * 1024 * 1024,
  MAX_TOTAL = 250 * 1024 * 1024;
const id = z.string().uuid();
const nullableId = id.nullable();
const archived = z.boolean();
const revision = z.number().int().min(0);
const deletedAt = z.string().datetime().nullable();
const common = { id, revision };
const cents = z.number().int().min(0).max(999999999).nullable();
const rows = {
  rooms: schemas.room.extend({ ...common, archived }),
  equipments: z
    .object({
      ...schemas.equipment.shape,
      ...common,
      archived,
      roomId: nullableId,
      purchasedOn: dateSchema.nullable(),
      warrantyUntil: dateSchema.nullable(),
      purchasedCents: cents,
    })
    .refine(
      (v) =>
        !v.purchasedOn || !v.warrantyUntil || v.warrantyUntil >= v.purchasedOn,
    ),
  tasks: schemas.maintenance.extend({
    ...common,
    archived,
    equipmentId: nullableId,
    anchorDay: z.number().int().min(1).max(31),
  }),
  history: z.object({
    id,
    maintenanceId: id,
    completedOn: dateSchema,
    scheduledOn: dateSchema,
    outcome: z.enum(["completed", "skipped", "cancelled"]),
    costCents: cents,
    taskTitle: z.string().max(120),
    notes: z.string().max(4000),
    author: z.string().max(254).nullable(),
  }),
  lists: schemas.shoppingList.extend({ ...common, deletedAt }),
  items: schemas.shoppingItem.extend({
    ...common,
    listId: id,
    deletedAt,
    checked: z.boolean(),
    equipmentId: nullableId,
    maintenanceId: nullableId,
  }),
  documents: schemas.document.extend({
    ...common,
    equipmentId: nullableId,
    deletedAt,
    originalName: z.string().min(1).max(255),
    mime: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
    size: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
    createdAt: z.string().datetime(),
    file: z.string().regex(/^files\/[a-f0-9-]+\.(pdf|jpg|png|webp)$/),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
};
const manifestSchema = z.object({
  version: z.literal(2),
  exportedAt: z.string().datetime(),
  household: z.object({
    name: z.string().min(1).max(80),
    currency: z.string().regex(/^[A-Z]{3}$/),
    timezone: z
      .string()
      .max(100)
      .refine((v) => {
        try {
          new Intl.DateTimeFormat("fr", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }),
  }),
  rooms: z.array(rows.rooms).max(50000),
  equipments: z.array(rows.equipments).max(50000),
  tasks: z.array(rows.tasks).max(50000),
  history: z.array(rows.history).max(50000),
  lists: z.array(rows.lists).max(50000),
  items: z.array(rows.items).max(50000),
  documents: z.array(rows.documents).max(1999),
});
export async function exportBackup(
  database: typeof productionDb,
  actorId: string,
  householdId: string,
) {
  await requireMembership(database, actorId, householdId);
  return database.transaction(
    async (tx) => {
      const [home] = await tx
        .select()
        .from(household)
        .where(eq(household.id, householdId));
      const files = await tx
        .select()
        .from(document)
        .where(eq(document.householdId, householdId))
        .for("share");
      const zip = new AdmZip();
      let total = 0;
      const docs = [];
      for (const doc of files) {
        const bytes = await readFile(filePath(doc.storageKey));
        total += bytes.length;
        if (total > MAX_TOTAL)
          throw new DomainError("La sauvegarde dépasse 250 Mo.");
        const file = `files/${doc.id}.${{ "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[doc.mime as "application/pdf"]}`;
        zip.addFile(file, bytes);
        docs.push({
          ...doc,
          file,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
      const [rooms, equipments, tasks, history, lists, items] =
        await Promise.all([
          tx.select().from(room).where(eq(room.householdId, householdId)),
          tx
            .select()
            .from(equipment)
            .where(eq(equipment.householdId, householdId)),
          tx
            .select()
            .from(maintenance)
            .where(eq(maintenance.householdId, householdId)),
          tx
            .select()
            .from(intervention)
            .where(eq(intervention.householdId, householdId)),
          tx
            .select()
            .from(shoppingList)
            .where(eq(shoppingList.householdId, householdId)),
          tx
            .select()
            .from(shoppingItem)
            .where(eq(shoppingItem.householdId, householdId)),
        ]);
      const authorIds = history
        .map((h) => h.completedBy)
        .filter((id): id is string => !!id);
      const authors = authorIds.length
        ? await import("@/db/schema").then(async ({ user }) =>
            tx
              .select({ id: user.id, name: user.name })
              .from(user)
              .where(inArray(user.id, authorIds)),
          )
        : [];
      const data = manifestSchema.parse(
        JSON.parse(
          JSON.stringify({
            version: 2,
            exportedAt: new Date().toISOString(),
            household: home,
            rooms,
            equipments,
            tasks,
            history: history.map((h) => ({
              ...h,
              author: authors.find((u) => u.id === h.completedBy)?.name || null,
            })),
            lists,
            items,
            documents: docs,
          }),
        ),
      );
      const manifest = Buffer.from(JSON.stringify(data, null, 2));
      if (
        manifest.length > 10 * 1024 * 1024 ||
        total + manifest.length > MAX_TOTAL
      )
        throw new DomainError(
          "Les données structurées dépassent 10 Mo. Utilise la sauvegarde serveur.",
        );
      zip.addFile("manifest.json", manifest);
      const bytes = zip.toBuffer();
      if (bytes.length > MAX_ARCHIVE)
        throw new DomainError("La sauvegarde dépasse 100 Mo.");
      return bytes;
    },
    { isolationLevel: "repeatable read" },
  );
}
function readEntry(entry: AdmZip.IZipEntry) {
  if (entry.header.flags & 1)
    throw new DomainError("Archives chiffrées non prises en charge.");
  const raw = entry.getCompressedData();
  const bytes =
    entry.header.method === 0
      ? raw
      : entry.header.method === 8
        ? inflateRawSync(raw, { maxOutputLength: 10 * 1024 * 1024 })
        : null;
  if (
    !bytes ||
    bytes.length !== entry.header.size ||
    bytes.length > 10 * 1024 * 1024
  )
    throw new DomainError("Entrée ZIP invalide.");
  return bytes;
}
export function inspectBackup(bytes: Buffer) {
  if (bytes.length > MAX_ARCHIVE)
    throw new DomainError("Archive limitée à 100 Mo.");
  const zip = new AdmZip(bytes);
  const entries = zip.getEntries();
  if (entries.length > 2000) throw new DomainError("Trop de fichiers.");
  const paths = new Set<string>();
  let size = 0;
  for (const entry of entries) {
    if (
      entry.isDirectory ||
      paths.has(entry.entryName) ||
      !/^(manifest\.json|files\/[a-f0-9-]+\.(pdf|jpg|png|webp))$/.test(
        entry.entryName,
      )
    )
      throw new DomainError("Archive invalide.");
    paths.add(entry.entryName);
    size += entry.header.size;
    if (entry.header.size > 10 * 1024 * 1024 || size > MAX_TOTAL)
      throw new DomainError("Archive trop volumineuse.");
  }
  const entry = zip.getEntry("manifest.json");
  if (!entry) throw new DomainError("Manifest manquant.");
  const data = manifestSchema.parse(
    JSON.parse(readEntry(entry).toString("utf8")),
  );
  const sets = new Map<string, Set<string>>();
  for (const key of [
    "rooms",
    "equipments",
    "tasks",
    "history",
    "lists",
    "items",
    "documents",
  ] as const) {
    const ids = new Set(data[key].map((r) => r.id));
    if (ids.size !== data[key].length)
      throw new DomainError("Identifiants dupliqués.");
    sets.set(key, ids);
  }
  function ref(key: string, value: string | null) {
    if (value && !sets.get(key)?.has(value))
      throw new DomainError("Association absente de la sauvegarde.");
  }
  for (const row of data.equipments) ref("rooms", row.roomId);
  for (const row of data.tasks) ref("equipments", row.equipmentId);
  for (const row of data.history) ref("tasks", row.maintenanceId);
  for (const row of data.items) {
    ref("lists", row.listId);
    ref("equipments", row.equipmentId);
    ref("tasks", row.maintenanceId);
  }
  for (const row of data.documents) {
    ref("equipments", row.equipmentId);
    const file = zip.getEntry(row.file);
    if (!file) throw new DomainError("Fichier original absent.");
    const content = readEntry(file);
    if (
      content.length !== row.size ||
      createHash("sha256").update(content).digest("hex") !== row.sha256
    )
      throw new DomainError("Fichier original altéré.");
  }
  if (
    paths.size !== data.documents.length + 1 ||
    new Set(data.documents.map((d) => d.file)).size !== data.documents.length
  )
    throw new DomainError("Fichiers inattendus ou dupliqués.");
  return { data, zip };
}
async function chunks<T>(
  rows: T[],
  write: (rows: T[]) => PromiseLike<unknown>,
) {
  for (let i = 0; i < rows.length; i += 500)
    await write(rows.slice(i, i + 500));
}
export async function importBackup(
  database: typeof productionDb,
  actorId: string,
  householdId: string,
  bytes: Buffer,
) {
  await requireMembership(database, actorId, householdId, true);
  const { data, zip } = inspectBackup(bytes);
  const keys: string[] = [];
  const oldKeys: string[] = [];
  const maps = Object.fromEntries(
    Object.entries(data)
      .filter(([, v]) => Array.isArray(v))
      .map(([k, v]) => [
        k,
        new Map((v as { id: string }[]).map((row) => [row.id, randomUUID()])),
      ]),
  ) as Record<string, Map<string, string>>;
  const map = (key: string, value: string | null) =>
    value ? maps[key].get(value)! : null;
  const docs: (typeof document.$inferInsert)[] = [];
  try {
    for (const doc of data.documents) {
      const bytes = readEntry(zip.getEntry(doc.file)!);
      const saved = await saveFile(
        new File([new Uint8Array(bytes)], doc.originalName, { type: doc.mime }),
        doc.category === "photo",
      );
      keys.push(saved.storageKey);
      docs.push({
        id: map("documents", doc.id)!,
        householdId,
        revision: 0,
        title: doc.title,
        category: doc.category,
        tags: doc.tags,
        equipmentId: map("equipments", doc.equipmentId),
        deletedAt: doc.deletedAt ? new Date(doc.deletedAt) : null,
        createdAt: new Date(doc.createdAt),
        originalName: doc.originalName,
        ...saved,
      });
    }
    await database.transaction(
      async (tx) => {
        // Authentication, memberships and invitations are deliberately outside the archive.
        await tx
          .select()
          .from(household)
          .where(eq(household.id, householdId))
          .for("update");
        oldKeys.push(
          ...(
            await tx
              .select({ key: document.storageKey })
              .from(document)
              .where(eq(document.householdId, householdId))
              .for("update")
          ).map((r) => r.key),
        );
        for (const table of [
          reminderDelivery,
          offlineMutation,
          document,
          shoppingItem,
          shoppingList,
          intervention,
          maintenance,
          equipment,
          room,
        ])
          await tx.delete(table).where(eq(table.householdId, householdId));
        await tx
          .update(household)
          .set({ ...data.household, revision: sql`${household.revision} + 1` })
          .where(eq(household.id, householdId));
        if (data.rooms.length)
          await chunks(
            data.rooms.map((r) => ({
              ...r,
              id: map("rooms", r.id)!,
              householdId,
              revision: 0,
            })),
            (chunk) => tx.insert(room).values(chunk),
          );
        if (data.equipments.length)
          await chunks(
            data.equipments.map((r) => ({
              ...r,
              id: map("equipments", r.id)!,
              roomId: map("rooms", r.roomId),
              householdId,
              revision: 0,
            })),
            (chunk) => tx.insert(equipment).values(chunk),
          );
        if (data.tasks.length)
          await chunks(
            data.tasks.map((r) => ({
              ...r,
              id: map("tasks", r.id)!,
              equipmentId: map("equipments", r.equipmentId),
              householdId,
              revision: 0,
            })),
            (chunk) => tx.insert(maintenance).values(chunk),
          );
        if (data.history.length)
          await chunks(
            data.history.map((r) => ({
              ...r,
              id: map("history", r.id)!,
              maintenanceId: map("tasks", r.maintenanceId)!,
              householdId,
              completedBy: null,
              notes: r.author
                ? `${r.notes}\nAuteur avant restauration : ${r.author}`
                    .trim()
                    .slice(0, 4000)
                : r.notes,
            })),
            (chunk) => tx.insert(intervention).values(chunk),
          );
        if (data.lists.length)
          await chunks(
            data.lists.map((r) => ({
              ...r,
              id: map("lists", r.id)!,
              deletedAt: r.deletedAt ? new Date(r.deletedAt) : null,
              householdId,
              revision: 0,
            })),
            (chunk) => tx.insert(shoppingList).values(chunk),
          );
        if (data.items.length)
          await chunks(
            data.items.map((r) => ({
              ...r,
              id: map("items", r.id)!,
              listId: map("lists", r.listId)!,
              equipmentId: map("equipments", r.equipmentId),
              maintenanceId: map("tasks", r.maintenanceId),
              deletedAt: r.deletedAt ? new Date(r.deletedAt) : null,
              householdId,
              revision: 0,
            })),
            (chunk) => tx.insert(shoppingItem).values(chunk),
          );
        if (docs.length)
          await chunks(docs, (chunk) => tx.insert(document).values(chunk));
      },
      { isolationLevel: "serializable" },
    );
  } catch (error) {
    await Promise.all(keys.map((key) => unlink(filePath(key)).catch(() => {})));
    throw error;
  }
  await Promise.all(
    oldKeys.map((key) => unlink(filePath(key)).catch(() => {})),
  );
  return {
    rooms: data.rooms.length,
    equipments: data.equipments.length,
    tasks: data.tasks.length,
    documents: data.documents.length,
  };
}
