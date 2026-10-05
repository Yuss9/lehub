import { and, eq, isNull, or, lt, asc } from "drizzle-orm";
import type { db as productionDb } from "@/db";
import { document } from "@/db/schema";
import { extractText } from "./ocr";
type Database = typeof productionDb;
export async function finishRecognition(
  database: Database,
  job: typeof document.$inferSelect,
  text: string,
  failed: boolean,
) {
  return database
    .update(document)
    .set({
      extractedText: text,
      ocrStatus: failed ? "error" : "done",
      ocrStartedAt: null,
      ocrFinishedAt: new Date(),
      ocrError: failed
        ? "Extraction impossible. Vérifie Poppler/Tesseract ou corrige le texte manuellement."
        : "",
    })
    .where(
      and(
        eq(document.id, job.id),
        eq(document.storageKey, job.storageKey),
        eq(document.revision, job.revision),
        eq(document.ocrStatus, "processing"),
        job.ocrStartedAt
          ? eq(document.ocrStartedAt, job.ocrStartedAt)
          : undefined,
        isNull(document.deletedAt),
      ),
    )
    .returning();
}

export async function processOcrBatch(database: Database, options: { batchSize: number; concurrency: number; stopped?: () => boolean }, extract = extractText) {
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100 || !Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 4) throw Error("Lot OCR invalide (1–100 fichiers, 1–4 traitements simultanés).");
  let claimed = 0, processed = 0;
  async function consume() {
    while (!options.stopped?.() && claimed < options.batchSize) {
      claimed++;
      const job = await database.transaction(async (tx) => {
        const [file] = await tx.select().from(document).where(and(isNull(document.deletedAt), or(eq(document.ocrStatus, "pending"), and(eq(document.ocrStatus, "processing"), lt(document.ocrStartedAt, new Date(Date.now() - 15 * 60000)))))).orderBy(asc(document.createdAt), asc(document.id)).for("update", { skipLocked: true }).limit(1);
        if (!file) return;
        const startedAt = new Date();
        await tx.update(document).set({ ocrStatus: "processing", ocrStartedAt: startedAt, ocrFinishedAt: null, ocrError: "" }).where(eq(document.id, file.id));
        return { ...file, ocrStartedAt: startedAt };
      });
      if (!job) return;
      let text = "", failed = false;
      try { text = await extract(job.storageKey, job.mime); } catch { failed = true; }
      await finishRecognition(database, job, text, failed);
      processed++;
    }
  }
  await Promise.all(Array.from({ length: options.concurrency }, consume));
  return processed;
}
