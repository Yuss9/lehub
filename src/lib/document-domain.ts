import { randomUUID } from "node:crypto";
import { and, eq, sql, isNull } from "drizzle-orm";
import { db } from "@/db";
import { document } from "@/db/schema";
import { requireMembership, DomainError } from "./domain";
import { owned, schemas, assertRevision } from "./home-domain";
import { saveFile, removePrivateFile } from "./files";
export async function uploadDocument(
  actorId: string,
  householdId: string,
  raw: unknown,
  file: File,
  database = db,
) {
  await requireMembership(database, actorId, householdId);
  const data = schemas.document.parse(raw);
  if (data.equipmentId)
    await owned(database, "equipment", householdId, data.equipmentId);
  const stored = await saveFile(file, data.category === "photo");
  try {
    await database.insert(document).values({
      id: randomUUID(),
      householdId,
      ...data,
      originalName: file.name.replace(/[\r\n]/g, "").slice(0, 255),
      ...stored,
    });
  } catch (error) {
    await removePrivateFile(stored.storageKey);
    throw error;
  }
}
export async function replaceDocument(
  actorId: string,
  householdId: string,
  id: string,
  revision: unknown,
  file: File,
  database = db,
) {
  await requireMembership(database, actorId, householdId);
  const old = await owned(database, "document", householdId, id);
  if (!("storageKey" in old)) throw new DomainError("Fichier introuvable.");
  assertRevision(revision, old.revision);
  const stored = await saveFile(file, old.category === "photo");
  try {
    const changed = await database
      .update(document)
      .set({
        ...stored,
        originalName: file.name.replace(/[\r\n]/g, "").slice(0, 255),
        extractedText: "",
        ocrStatus: "pending",
        ocrStartedAt: null,
        revision: sql`${document.revision} + 1`,
      })
      .where(
        and(
          eq(document.id, id),
          eq(document.householdId, householdId),
          eq(document.revision, old.revision),
          isNull(document.deletedAt),
        ),
      )
      .returning();
    if (!changed.length)
      throw new DomainError("Le document a changé. Actualise la page.");
  } catch (error) {
    await removePrivateFile(stored.storageKey);
    throw error;
  }
  // Failure to remove an old orphan does not invalidate the successful replacement.
  await removePrivateFile(old.storageKey).catch(() => {});
}
