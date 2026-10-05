import { workerHeartbeat } from "../src/lib/operations";
import { db, pool } from "../src/db/index";
import { and, eq, lt, isNull, or } from "drizzle-orm";
import { document, passwordReset } from "../src/db/schema";
import { finishRecognition } from "../src/lib/document-processing";
import { extractText } from "../src/lib/ocr";
import { queueReminders, deliverReminder } from "../src/lib/reminders";

import { removePrivateFile } from "../src/lib/files";
let stopped = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopped = true;
  });
async function tick() {
  await workerHeartbeat(db, "worker");
  await queueReminders(db);
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
      const startedAt = new Date();
      if (job)
        await tx
          .update(document)
          .set({
            ocrStatus: "processing",
            ocrStartedAt: startedAt,
            ocrFinishedAt: null,
            ocrError: "",
          })
          .where(eq(document.id, job.id));
      return job ? { ...job, ocrStartedAt: startedAt } : undefined;
    });
    if (file) {
      let extractedText = "";
      let ocrStatus = "done";
      try {
        extractedText = await extractText(file.storageKey, file.mime);
      } catch {
        ocrStatus = "error";
      }
      await finishRecognition(db, file, extractedText, ocrStatus === "error");
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
const heartbeat = setInterval(() => {
  void workerHeartbeat(db, "worker").catch(() => {});
}, 20000);
try {
  while (!stopped) {
    try {
      await tick();
      await workerHeartbeat(db, "worker", {
        completedAt: new Date(),
        lastError: "",
      });
    } catch {
      await workerHeartbeat(db, "worker", {
        lastError:
          "Cycle interrompu. Vérifie la base et les journaux du worker.",
      }).catch(() => {});
      if (process.argv.includes("--once")) process.exitCode = 1;
      console.error(
        "Worker: traitement interrompu ; nouvelle tentative au prochain cycle.",
      );
    }
    if (process.argv.includes("--once")) break;
    for (let i = 0; i < 60 && !stopped; i++)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  clearInterval(heartbeat);
  await pool.end();
}
