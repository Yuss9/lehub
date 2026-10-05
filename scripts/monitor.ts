import { db, pool } from "../src/db";
import { monitorOperations, sendOperationsAlert } from "../src/lib/operations-monitor";
let stopped = false;
let lastFailureAlert = 0;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { stopped = true; });
try {
  const destination = new URL(process.env.OPERATIONS_ALERT_URL || "");
  if (destination.protocol !== "https:" || destination.username || destination.password) throw Error("Configure un relais d’alerte HTTPS sans identifiants dans l’URL.");
  do {
    try { await monitorOperations(db); }
    catch {
      if (Date.now() - lastFailureAlert >= 3600000) {
        try { await sendOperationsAlert("lehub — surveillance ou base indisponible. Vérifie l’installation."); lastFailureAlert = Date.now(); } catch { /* Retry next cycle without printing secrets. */ }
      }
      console.error("lehub — surveillance indisponible : vérifie la base et le relais d’alerte."); if (process.argv.includes("--once")) process.exitCode = 1;
    }
    if (process.argv.includes("--once")) break;
    for (let i = 0; i < 60 && !stopped; i++) await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (!stopped);
} finally { await pool.end(); }
