// Real application, disposable test database. Never points to DATABASE_URL
// from .env and never modifies the user's PostgreSQL instance.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { cp, mkdtemp, rm } from "node:fs/promises";
const db = await PGlite.create();
await migrate(drizzle(db), { migrationsFolder: "./drizzle" });
const server = new PGLiteSocketServer({
  db,
  port: 54329,
  host: "127.0.0.1",
  maxConnections: 10,
});
await server.start();
let app;
const filesDirectory = await mkdtemp(path.join(tmpdir(), "lehub-e2e-"));
try {
  // Mirrors the production Docker image's standalone file layout.
  await cp(".next/static", ".next/standalone/.next/static", {
    recursive: true,
  });
  await cp("public", ".next/standalone/public", { recursive: true });
  const env = {
    ...process.env,
    DATABASE_POOL_SIZE: "1", // PGlite socket multiplexes one PostgreSQL session.
    DOCUMENTS_DIR: filesDirectory,
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54329/postgres",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "only-for-temporary-local-testing-123456789",
    SETUP_KEY: "only-for-temporary-local-setup-123456789",
    HOSTNAME: "127.0.0.1",
    PORT: "3000",
    NODE_ENV: "production",
  };
  app = spawn(process.execPath, [".next/standalone/server.js"], {
    env,
    stdio: "inherit",
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null) throw new Error("Application failed to start");
    try {
      const response = await fetch("http://localhost:3000/api/health");
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("Application did not become healthy");
  const test = spawn(
    process.execPath,
    ["node_modules/@playwright/test/cli.js", "test"],
    { env, stdio: "inherit" },
  );
  const [code] = await once(test, "exit");
  process.exitCode = code ?? 1;
} finally {
  if (app && app.exitCode === null) {
    app.kill("SIGTERM");
    await once(app, "exit");
  }
  await server.stop();
  // pglite-socket schedules socket detach callbacks on the next check phase.
  // Drain those callbacks before releasing the underlying WASM database.
  await new Promise((resolve) => setImmediate(resolve));
  await db.close();
  await rm(filesDirectory, { recursive: true, force: true });
}
