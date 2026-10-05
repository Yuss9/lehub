// Only called by compose.validation.yml, against its disposable validation services.
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "../src/db/schema";
import { setupHousehold } from "../src/lib/domain";
import { saveFile } from "../src/lib/files";
import { exportBackup, importBackup } from "../src/lib/backup";
import { queueReminders, deliverReminder } from "../src/lib/reminders";
import {
  createServerBackup,
  verifyServerBackup,
} from "../src/lib/server-backup";
const source = process.env.TEST_POSTGRES_URL;
if (!source || process.env.LEHUB_VALIDATION !== "isolated")
  throw Error("Utilise le projet Compose de validation isolé.");
const name = `lehub_validation_${randomUUID().replaceAll("-", "")}`;
const admin = new Pool({ connectionString: source });
const directory = await mkdtemp(join(tmpdir(), "lehub-validation-"));
let pool: Pool | undefined,
  created = false;
try {
  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch("http://application:3000/api/health")).ok) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(healthy, true, "Image de production non disponible");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/test-postgres.ts"],
      { stdio: "inherit", env: process.env },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(Error("Concurrence PostgreSQL non validée")),
    );
  });
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  const url = new URL(source);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  process.env.BACKUP_TEST_POSTGRES_URL = source;
  process.env.DOCUMENTS_DIR = join(directory, "documents");
  process.env.SERVER_BACKUPS_DIR = join(directory, "backups");
  pool = new Pool({ connectionString: url.toString() });
  const db = drizzle(pool, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  const key = "temporary-validation-key-1234567890";
  await setupHousehold(
    db,
    {
      name: "Test",
      email: "validation@example.test",
      password: "temporary-password-123456",
      householdName: "Validation",
      setupKey: key,
    },
    key,
  );
  const [{ id: home }] = await db.select().from(schema.household);
  const [{ id: actor }] = await db.select().from(schema.user);
  const stored = await saveFile(
    new File(["%PDF-1.7\nvalidation"], "notice.pdf", {
      type: "application/pdf",
    }),
  );
  await db
    .insert(schema.document)
    .values({
      id: randomUUID(),
      householdId: home,
      title: "Notice",
      category: "manual",
      originalName: "notice.pdf",
      ...stored,
    });
  const zip = await exportBackup(db, actor, home);
  await importBackup(db, actor, home, zip);
  assert.equal((await db.select().from(schema.document)).length, 1);
  await db
    .insert(schema.maintenance)
    .values({
      id: randomUUID(),
      householdId: home,
      title: "SMTP natif",
      dueOn: "2020-01-01",
      anchorDay: 1,
    });
  await db
    .insert(schema.reminderPreference)
    .values({ householdId: home, userId: actor, emailEnabled: true });
  await queueReminders(db);
  await deliverReminder(db);
  assert.equal(
    (await db.select().from(schema.reminderDelivery))[0].status,
    "sent",
  );
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/worker.ts", "--once"],
      { env: { ...process.env, OCR_ENABLED: "false" }, stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error("Worker non validé")),
    );
  });
  assert.equal((await db.select().from(schema.workerState))[0].lastError, "");
  const archive = await createServerBackup();
  await verifyServerBackup(archive);
  assert.equal(
    (await readdir(process.env.SERVER_BACKUPS_DIR)).filter((f) =>
      f.endsWith(".enc"),
    ).length,
    1,
  );
  const leftover = await admin.query(
    "SELECT datname FROM pg_database WHERE datname LIKE 'lehub_backup_verify_%'",
  );
  assert.equal(leftover.rowCount, 0);
  console.log(
    "PostgreSQL natif, migrations, SMTP, ZIP métier, sauvegarde chiffrée et restauration serveur : validés.",
  );
} finally {
  await pool?.end();
  if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await admin.end();
  await rm(directory, { recursive: true, force: true });
}
