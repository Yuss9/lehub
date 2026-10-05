import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";
async function run(args: string[], hash?: ReturnType<typeof createHash>) {
  const child = spawn("rclone", args, { stdio: ["ignore", hash ? "pipe" : "ignore", "ignore"] });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 30 * 60000);
  try {
    const exited = new Promise<void>((resolve, reject) => { child.on("error", () => reject(Error("Copie distante indisponible."))); child.on("exit", (code) => code === 0 ? resolve() : reject(Error("Copie distante non vérifiée."))); });
    const read = hash ? pipeline(child.stdout!, new Writable({ write(chunk, _, done) { hash.update(chunk); done(); } })) : Promise.resolve();
    await Promise.all([exited, read]);
  } finally { clearTimeout(timeout); child.stdout?.destroy(); if (child.exitCode === null) child.kill("SIGKILL"); }
}
// Only encrypted archives are transferred; credentials live in a read-only rclone config.
// Unique names prevent overwrites, and re-downloading verifies the remote bytes.
export async function replicateBackup(archive: string) {
  const remote = process.env.BACKUP_REMOTE;
  if (!remote || !/^[a-zA-Z][a-zA-Z0-9_-]*:[^\r\n]*$/.test(remote) || !/^lehub-server-.*\.enc$/.test(basename(archive))) throw Error("Destination distante invalide.");
  const config = process.env.RCLONE_CONFIG || "/config/rclone.conf";
  const destination = `${remote.replace(/\/$/, "")}/${basename(archive)}`;
  await run(["copyto", archive, destination, "--config", config, "--immutable", "--retries", "3"]);
  const local = createHash("sha256");
  for await (const chunk of createReadStream(archive)) local.update(chunk);
  const copied = createHash("sha256");
  await run(["cat", destination, "--config", config, "--retries", "3"], copied);
  if (local.digest("hex") !== copied.digest("hex")) throw Error("Empreinte distante différente. La copie doit être relancée.");
}
