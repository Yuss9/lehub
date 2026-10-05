import {
  randomUUID,
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import {
  mkdtemp,
  copyFile,
  chmod,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  rename,
  stat,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import pg from "pg";
import { filePath } from "./files";
const MAGIC = Buffer.from("LEHUBBK1");
export function backupKey() {
  const raw = process.env.BACKUP_ENCRYPTION_KEY || "";
  if (!/^[a-fA-F0-9]{64}$/.test(raw))
    throw Error(
      "BACKUP_ENCRYPTION_KEY doit contenir 64 caractères hexadécimaux.",
    );
  return Buffer.from(raw, "hex");
}
function pgEnvironment(url: string, database?: string) {
  const parsed = new URL(url);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol))
    throw Error("URL PostgreSQL invalide");
  return {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: database || decodeURIComponent(parsed.pathname.slice(1)),
    PGSSLMODE:
      parsed.searchParams.get("sslmode") || process.env.PGSSLMODE || "prefer",
  };
}
async function command(program: string, args: string[], env = process.env) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(program, args, {
      env,
      stdio: ["ignore", "ignore", "ignore"],
    });
    const timeout = setTimeout(() => child.kill("SIGKILL"), 15 * 60000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(Error(`${program} a échoué (${code}).`));
    });
  });
}
async function hashFile(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
type Manifest = {
  version: 1;
  createdAt: string;
  counts: Record<string, number>;
  files: { key: string; sha256: string; size: number }[];
};
const TABLES = [
  "user", "session", "account", "verification", "rate_limit",
  "household", "membership", "installation", "invitation", "room",
  "document", "equipment", "maintenance", "intervention", "intervention_correction",
  "shopping_list", "shopping_item", "password_reset", "reminder_preference",
  "reminder_delivery", "offline_mutation", "worker_state", "push_subscription",
  "push_receipt", "operations_alert",
];
async function counts(client: pg.Client, tables = TABLES) {
  if (tables.some((table) => !TABLES.includes(table))) throw Error("Table de sauvegarde inconnue");
  const output: Record<string, number> = {};
  for (const table of tables)
    output[table] = Number(
      (await client.query(`SELECT count(*) AS n FROM "${table}"`)).rows[0].n,
    );
  return output;
}
async function verifyDirectory(directory: string, adminUrl: string) {
  const manifest: Manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
  if (manifest.version !== 1) throw Error("Version de sauvegarde inconnue");
  for (const file of manifest.files) {
    if (!/^[a-f0-9-]{36}$/.test(file.key))
      throw Error("Clé de fichier invalide");
    const path = join(directory, "documents", file.key);
    if (
      (await stat(path)).size !== file.size ||
      (await hashFile(path)) !== file.sha256
    )
      throw Error("Original endommagé");
  }
  const database = `lehub_backup_verify_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    await command(
      "pg_restore",
      [
        "--no-owner",
        "--no-privileges",
        "--exit-on-error",
        "--single-transaction",
        "-d",
        database,
        join(directory, "database.dump"),
      ],
      pgEnvironment(adminUrl, database),
    );
    const url = new URL(adminUrl);
    url.pathname = `/${database}`;
    const restored = new pg.Client({ connectionString: url.toString() });
    await restored.connect();
    try {
      const actual = await counts(restored, Object.keys(manifest.counts));
      if (JSON.stringify(actual) !== JSON.stringify(manifest.counts))
        throw Error("Comptages restaurés différents");
      const files = (
        await restored.query(
          "SELECT storage_key, size FROM document ORDER BY storage_key",
        )
      ).rows;
      if (
        files.length !== manifest.files.length ||
        files.some(
          (f, i) =>
            f.storage_key !== manifest.files[i].key ||
            f.size !== manifest.files[i].size,
        )
      )
        throw Error("Les références des originaux diffèrent");
    } finally {
      await restored.end();
    }
  } finally {
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
  }
}
export async function createServerBackup() {
  const key = backupKey();
  const url = process.env.DATABASE_URL;
  if (!url) throw Error("DATABASE_URL manquant");
  const root = process.env.SERVER_BACKUPS_DIR || "/app/data/backups";
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(root, ".staging-"));
  const client = new pg.Client({ connectionString: url });
  let connected = false;
  try {
    await client.connect();
    connected = true;
    // Serialize backup processes. Immutable originals are protected against replace/delete/purge.
    await client.query("SELECT pg_advisory_lock(741904)");
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const documents = (
      await client.query(
        "SELECT storage_key, size FROM document ORDER BY storage_key FOR SHARE",
      )
    ).rows;
    const snapshot = (await client.query("SELECT pg_export_snapshot() AS id"))
      .rows[0].id as string;
    const manifest: Manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      counts: await counts(client),
      files: [],
    };
    await mkdir(join(directory, "documents"), { mode: 0o700 });
    for (const document of documents) {
      const destination = join(directory, "documents", document.storage_key);
      await pipeline(
        createReadStream(filePath(document.storage_key)),
        createWriteStream(destination, { mode: 0o600 }),
      );
      manifest.files.push({
        key: document.storage_key,
        size: document.size,
        sha256: await hashFile(destination),
      });
    }
    await command(
      "pg_dump",
      ["-Fc", "--snapshot", snapshot, "-f", join(directory, "database.dump")],
      pgEnvironment(url),
    );
    await client.query("COMMIT");
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify(manifest),
      { mode: 0o600 },
    );
    // Save effective server configuration, including secrets, INSIDE the encrypted archive.
    const config = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) =>
          /^(DATABASE_URL|POSTGRES_|BETTER_AUTH_|SETUP_KEY|SMTP_|OCR_ENABLED|DOCUMENTS_DIR|VAPID_|SERVER_BACKUPS_DIR|BACKUP_INTERVAL_HOURS|BACKUP_RETENTION|BACKUP_REMOTE)$/.test(
            name,
          ) || /^(POSTGRES_|BETTER_AUTH_|SMTP_|VAPID_|OCR_|OPERATIONS_|MONITOR_|RCLONE_)/.test(name),
      ),
    );
    delete config.BACKUP_ENCRYPTION_KEY;
    await writeFile(
      join(directory, "configuration.json"),
      JSON.stringify(config),
      { mode: 0o600 },
    );
    const extras: string[] = [];
    if (process.env.BACKUP_REMOTE) {
      await copyFile(process.env.RCLONE_CONFIG || "/config/rclone.conf", join(directory, "rclone.conf"));
      await chmod(join(directory, "rclone.conf"), 0o600);
      extras.push("rclone.conf");
    }
    const tar = join(directory, "payload.tar.gz");
    await command("tar", [
      "-czf",
      tar,
      "-C",
      directory,
      "database.dump",
      "documents",
      "manifest.json",
      "configuration.json",
      ...extras,
    ]);
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const encrypted = join(directory, "payload.enc");
    await writeFile(encrypted, Buffer.concat([MAGIC, nonce]), { mode: 0o600 });
    await pipeline(
      createReadStream(tar),
      cipher,
      createWriteStream(encrypted, { flags: "a", mode: 0o600 }),
    );
    await writeFile(encrypted, cipher.getAuthTag(), { flag: "a" });
    const name = `lehub-server-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID()}.enc`;
    const destination = join(root, name);
    // Validate the actual encrypted artifact before making it available or rotating older backups.
    await verifyServerBackup(encrypted);
    await rename(encrypted, destination);
    const retention = Number(process.env.BACKUP_RETENTION || 7);
    if (!Number.isInteger(retention) || retention < 1 || retention > 365)
      throw Error("BACKUP_RETENTION invalide");
    const archives = (await readdir(root))
      .filter((n) => /^lehub-server-.*\.enc$/.test(n))
      .sort()
      .reverse();
    for (const old of archives.slice(retention)) await rm(join(root, old));
    return destination;
  } finally {
    if (connected) {
      await client.query("ROLLBACK").catch(() => { });
      await client.end();
    }
    await rm(directory, { recursive: true, force: true });
  }
}
export async function verifyServerBackup(path: string) {
  const size = (await stat(path)).size;
  if (size < 36) throw Error("Archive tronquée");
  const { open } = await import("node:fs/promises");
  const handle = await open(path, "r");
  const header = Buffer.alloc(20),
    tag = Buffer.alloc(16);
  try {
    await handle.read(header, 0, 20, 0);
    await handle.read(tag, 0, 16, size - 16);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, 8).equals(MAGIC)) throw Error("Archive inconnue");
  const directory = await mkdtemp(join(tmpdir(), "lehub-restore-test-"));
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      backupKey(),
      header.subarray(8),
    );
    decipher.setAuthTag(tag);
    const tar = join(directory, "payload.tar.gz");
    await pipeline(
      createReadStream(path, { start: 20, end: size - 17 }),
      decipher,
      createWriteStream(tar, { mode: 0o600 }),
    );
    // Authenticated archive produced only by this server; never accepts arbitrary user tar files.
    await command("tar", [
      "-xzf",
      tar,
      "-C",
      directory,
      "--no-same-owner",
      "--no-same-permissions",
    ]);
    await verifyDirectory(
      directory,
      process.env.BACKUP_TEST_POSTGRES_URL || process.env.DATABASE_URL!,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

// Operator-only extraction into a NEW directory, never overwrites an existing installation.
export async function unpackServerBackup(path: string, destination: string) {
  const size = (await stat(path)).size;
  if (size < 36) throw Error("Archive tronquée");
  const { open } = await import("node:fs/promises");
  const handle = await open(path, "r");
  const header = Buffer.alloc(20),
    tag = Buffer.alloc(16);
  try {
    await handle.read(header, 0, 20, 0);
    await handle.read(tag, 0, 16, size - 16);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, 8).equals(MAGIC)) throw Error("Archive inconnue");
  await mkdir(destination, { mode: 0o700 });
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      backupKey(),
      header.subarray(8),
    );
    decipher.setAuthTag(tag);
    const tar = join(destination, "payload.tar.gz");
    await pipeline(
      createReadStream(path, { start: 20, end: size - 17 }),
      decipher,
      createWriteStream(tar, { mode: 0o600 }),
    );
    await command("tar", [
      "-xzf",
      tar,
      "-C",
      destination,
      "--no-same-owner",
      "--no-same-permissions",
    ]);
    const manifest: Manifest = JSON.parse(
      await readFile(join(destination, "manifest.json"), "utf8"),
    );
    if (manifest.version !== 1) throw Error("Version inconnue");
    for (const file of manifest.files) {
      if (
        !/^[a-f0-9-]{36}$/.test(file.key) ||
        (await hashFile(join(destination, "documents", file.key))) !==
        file.sha256
      )
        throw Error("Original invalide");
    }
    await rm(tar);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}
