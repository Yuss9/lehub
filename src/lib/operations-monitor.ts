import { eq } from "drizzle-orm";
import type { db as productionDb } from "@/db";
import { workerState, operationsAlert } from "@/db/schema";
import { workerHealth } from "./operations-health";
type Database = typeof productionDb;
export async function sendOperationsAlert(message: string) {
  const raw = process.env.OPERATIONS_ALERT_URL;
  if (!raw) throw Error("Configure OPERATIONS_ALERT_URL.");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password) throw Error("L’URL d’alerte doit utiliser HTTPS.");
  const response = await fetch(url, { method: "POST", body: message, headers: { "Content-Type": "text/plain; charset=utf-8", ...(process.env.OPERATIONS_ALERT_TOKEN ? { Authorization: `Bearer ${process.env.OPERATIONS_ALERT_TOKEN}` } : {}) }, redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error("Alerte non transmise.");
}
export async function monitorOperations(database: Database, notify = sendOperationsAlert, now = new Date()) {
  const workers = await database.select().from(workerState);
  const expected = ["worker", ...(process.env.MONITOR_BACKUPS === "true" ? ["backup"] : []), ...(process.env.BACKUP_REMOTE ? ["backup-offsite"] : [])];
  for (const id of expected) {
    const worker = workers.find((w) => w.id === id);
    const state = worker ? workerHealth(worker, now) : "missing";
    await database.transaction(async (tx) => {
      // Lock a dedicated row to prevent duplicate alerts from two monitors.
      await tx.insert(operationsAlert).values({ id, state: "ok", notifiedAt: new Date(0) }).onConflictDoNothing();
      const [previous] = await tx.select().from(operationsAlert).where(eq(operationsAlert.id, id)).for("update");
      const changed = previous.state !== state;
      if ((state !== "ok" && (changed || now.getTime() - previous.notifiedAt.getTime() >= 3600000)) || (state === "ok" && changed)) {
        await notify(`lehub — ${id} : ${state === "ok" ? "service rétabli" : "service absent, en retard ou en échec"}. Consulte les paramètres et journaux de l’installation.`);
        await tx.update(operationsAlert).set({ state, notifiedAt: now }).where(eq(operationsAlert.id, id));
      }
    });
  }
}
