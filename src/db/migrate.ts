import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations terminées.");
} catch (error) {
  console.error("Échec des migrations.", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
