import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

export function createAuth(
  database: typeof db,
  options: { baseURL?: string; secret?: string } = {},
) {
  return betterAuth({
    appName: "lehub",
    plugins: [
      twoFactor({
        issuer: "lehub",
        backupCodeOptions: { storeBackupCodes: "encrypted" },
      }),
    ],
    baseURL: options.baseURL ?? process.env.BETTER_AUTH_URL,
    secret: options.secret ?? process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(database, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  if (
    !process.env.BETTER_AUTH_URL ||
    !process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET.length < 32
  ) {
    throw new Error(
      "Set BETTER_AUTH_URL and a random BETTER_AUTH_SECRET of at least 32 characters.",
    );
  }
  return (instance ??= createAuth(db));
}
