import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const poolSize = Number(process.env.DATABASE_POOL_SIZE || 10);
if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 100)
  throw new Error("DATABASE_POOL_SIZE must be an integer from 1 to 100.");
const globalDb = globalThis as unknown as { lehubPool?: Pool };
export const pool =
  globalDb.lehubPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: poolSize });
if (process.env.NODE_ENV !== "production") globalDb.lehubPool = pool;
export const db = drizzle(pool, { schema });
