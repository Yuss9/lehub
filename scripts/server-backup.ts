import {
  createServerBackup,
  verifyServerBackup,
  unpackServerBackup,
} from "../src/lib/server-backup";
import { workerHeartbeat } from "../src/lib/operations";
import { db, pool } from "../src/db";
let stopped = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopped = true;
  });
try {
  const unpack = process.argv.indexOf("--unpack");
  const verify = process.argv.indexOf("--verify");
  if (unpack !== -1) {
    const output = process.argv.indexOf("--output");
    if (!process.argv[unpack + 1] || output === -1 || !process.argv[output + 1])
      throw Error("Utilise --unpack archive.enc --output dossier-neuf.");
    await unpackServerBackup(
      process.argv[unpack + 1],
      process.argv[output + 1],
    );
    console.log(
      "Archive déchiffrée et originaux vérifiés dans le dossier neuf.",
    );
  } else if (verify !== -1) {
    if (!process.argv[verify + 1])
      throw Error("Indique le chemin de l’archive à vérifier.");
    await verifyServerBackup(process.argv[verify + 1]);
    console.log("Restauration de contrôle réussie.");
  } else {
    const hours = Number(process.env.BACKUP_INTERVAL_HOURS || 24);
    if (!Number.isFinite(hours) || hours < 1 || hours > 168)
      throw Error("Intervalle invalide (1–168 heures).");
    do {
      await workerHeartbeat(db, "backup");
      try {
        await createServerBackup();
        await workerHeartbeat(db, "backup", {
          completedAt: new Date(),
          lastError: "",
        });
        console.log(
          "Sauvegarde chiffrée créée et restauration de contrôle réussie.",
        );
      } catch {
        await workerHeartbeat(db, "backup", {
          lastError:
            "Sauvegarde ou restauration de contrôle échouée. Les archives précédentes sont conservées.",
        }).catch(() => {});
        console.error(
          "Sauvegarde non validée. Vérifie les clients PostgreSQL, les droits CREATE DATABASE, les fichiers et la configuration.",
        );
        if (!process.argv.includes("--schedule")) process.exitCode = 1;
      }
      if (!process.argv.includes("--schedule")) break;
      const next = Date.now() + hours * 3600000;
      while (!stopped && Date.now() < next)
        await new Promise((resolve) => setTimeout(resolve, 1000));
    } while (!stopped);
  }
} finally {
  await pool.end();
}
