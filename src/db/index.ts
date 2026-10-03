import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalDb = globalThis as unknown as { lehubPool?: Pool };
export const pool =
  globalDb.lehubPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalDb.lehubPool = pool;
export const db = drizzle(pool, { schema });
