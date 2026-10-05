import { workerHeartbeat } from "../src/lib/operations";
import { db, pool } from "../src/db/index";
import { and, eq, lt } from "drizzle-orm";
import { document, passwordReset, session } from "../src/db/schema";
import { processOcrBatch } from "../src/lib/document-processing";
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
  await Promise.all([
    (async () => { for (let i = 0; i < 20 && !stopped; i++) if (!(await deliverReminder(db))) break; })(),
    process.env.OCR_ENABLED === "false" ? Promise.resolve() : processOcrBatch(db, { batchSize: Number(process.env.OCR_BATCH_SIZE || 10), concurrency: Number(process.env.OCR_CONCURRENCY || 2), stopped: () => stopped }),
  ]);
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
          await removePrivateFile(file.storageKey).catch(() => { });
      });
  }
  await db.delete(session).where(lt(session.expiresAt, new Date()));
  await db.delete(passwordReset).where(lt(passwordReset.expiresAt, new Date()));
  // Replay identifiers are kept indefinitely: an old device must not replay an acknowledged action.
}
const heartbeat = setInterval(() => {
  void workerHeartbeat(db, "worker").catch(() => { });
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
      }).catch(() => { });
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
