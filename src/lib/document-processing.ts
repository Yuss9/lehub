import { and, eq, isNull } from "drizzle-orm";
import type { db as productionDb } from "@/db";
import { document } from "@/db/schema";
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
