import { db, pool } from "../src/db/index";
import { and, eq, lt, isNull, or } from "drizzle-orm";
import { document, passwordReset } from "../src/db/schema";
import { extractText } from "../src/lib/ocr";
import { queueReminders, deliverReminder } from "../src/lib/reminders";
import { mailConfigured } from "../src/lib/mail";
import { removePrivateFile } from "../src/lib/files";
let stopped = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopped = true;
  });
async function tick() {
  await queueReminders(db);
  if (mailConfigured())
    for (let i = 0; i < 20; i++) if (!(await deliverReminder(db))) break;
  if (process.env.OCR_ENABLED !== "false") {
    const file = await db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(document)
        .where(
          and(
            isNull(document.deletedAt),
            or(
              eq(document.ocrStatus, "pending"),
              and(
                eq(document.ocrStatus, "processing"),
                lt(document.ocrStartedAt, new Date(Date.now() - 15 * 60000)),
              ),
            ),
          ),
        )
        .for("update", { skipLocked: true })
        .limit(1);
      if (job)
        await tx
          .update(document)
          .set({ ocrStatus: "processing", ocrStartedAt: new Date() })
          .where(eq(document.id, job.id));
      return job;
    });
    if (file) {
      let extractedText = "";
      let ocrStatus = "done";
      try {
        extractedText = await extractText(file.storageKey, file.mime);
      } catch {
        ocrStatus = "error";
      }
      await db
        .update(document)
        .set({ extractedText, ocrStatus, ocrStartedAt: null })
        .where(
          and(
            eq(document.id, file.id),
            eq(document.storageKey, file.storageKey),
            isNull(document.deletedAt),
          ),
        );
    }
  }
  const cutoff = new Date(Date.now() - 30 * 86400000);
  const trash = await db
    .select()
    .from(document)
    .where(lt(document.deletedAt, cutoff))
    .limit(20);
  for (const file of trash) {
    await db
      .delete(document)
      .where(
        and(
          eq(document.id, file.id),
          eq(document.revision, file.revision),
          lt(document.deletedAt, cutoff),
        ),
      )
      .returning()
      .then(async (rows) => {
        if (rows.length)
          await removePrivateFile(file.storageKey).catch(() => {});
      });
  }
  await db.delete(passwordReset).where(lt(passwordReset.expiresAt, new Date()));
  // Replay identifiers are kept indefinitely: an old device must not replay an acknowledged action.
}
try {
  while (!stopped) {
    try {
      await tick();
    } catch {
      console.error(
        "Worker: traitement interrompu ; nouvelle tentative au prochain cycle.",
      );
    }
    if (process.argv.includes("--once")) break;
    for (let i = 0; i < 60 && !stopped; i++)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await pool.end();
}
