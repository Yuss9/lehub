import { randomUUID, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";
import type { db as productionDb } from "@/db";
import { passwordReset, user, account, session, rateLimit } from "@/db/schema";
import { tokenHash, DomainError } from "./domain";
export async function recoveryAllowed(
  database: typeof productionDb,
  key: string,
) {
  const now = Date.now();
  const window = 15 * 60 * 1000;
  const [row] = await database
    .insert(rateLimit)
    .values({
      id: randomUUID(),
      key: `recovery:${tokenHash(key)}`,
      count: 1,
      lastRequest: now,
    })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${rateLimit.lastRequest} < ${now - window} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${rateLimit.lastRequest} < ${now - window} then ${now} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning();
  return row.count <= 3;
}
export async function issueReset(database: typeof productionDb, email: string) {
  const [person] = await database
    .select()
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()));
  if (!person) return null;
  const token = randomBytes(32).toString("base64url");
  await database
    .insert(passwordReset)
    .values({
      id: randomUUID(),
      userId: person.id,
      tokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
  return token;
}
export async function resetPassword(
  database: typeof productionDb,
  token: string,
  password: string,
) {
  z.string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .parse(token);
  z.string().min(12).max(128).parse(password);
  const passwordHash = await hashPassword(password);
  await database.transaction(async (tx) => {
    const [reset] = await tx
      .select()
      .from(passwordReset)
      .where(eq(passwordReset.tokenHash, tokenHash(token)))
      .for("update");
    if (!reset || reset.expiresAt <= new Date())
      throw new DomainError(
        "Lien invalide ou expiré. Demande un nouveau lien.",
      );
    const changed = await tx
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(
        and(
          eq(account.userId, reset.userId),
          eq(account.providerId, "credential"),
        ),
      )
      .returning();
    if (!changed.length) throw new DomainError("Compte indisponible.");
    await tx.delete(session).where(eq(session.userId, reset.userId));
    await tx
      .delete(passwordReset)
      .where(eq(passwordReset.userId, reset.userId));
  });
}
