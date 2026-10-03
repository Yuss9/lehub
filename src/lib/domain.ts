import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import type { db as productionDb } from "@/db";
import {
  account,
  household,
  installation,
  invitation,
  membership,
  user,
} from "@/db/schema";
import {
  emailSchema,
  householdSchema,
  personSchema,
  type PersonInput,
} from "./validation";

type Database = typeof productionDb;
export class DomainError extends Error {}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function validSecret(candidate: string, expected: string | undefined) {
  if (!expected || expected.length < 32) return false;
  return timingSafeEqual(
    Buffer.from(tokenHash(candidate)),
    Buffer.from(tokenHash(expected)),
  );
}
export async function requireMembership(
  database: Database,
  userId: string,
  householdId: string,
  admin = false,
) {
  const [member] = await database
    .select()
    .from(membership)
    .where(
      and(
        eq(membership.userId, userId),
        eq(membership.householdId, householdId),
      ),
    );
  if (!member || (admin && member.role !== "admin"))
    throw new DomainError("Action non autorisée.");
  return member;
}
// Better Auth owns hashing, authentication and sessions. Provisioning is atomic with
// household membership; the public Better Auth sign-up endpoint stays disabled.
async function provision(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  input: PersonInput,
  passwordHash: string,
) {
  const id = randomUUID();
  await tx
    .insert(user)
    .values({ id, name: input.name, email: input.email, emailVerified: false });
  await tx
    .insert(account)
    .values({
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: passwordHash,
    });
  return id;
}
export async function setupHousehold(
  database: Database,
  raw: PersonInput & { householdName: string; setupKey: string },
  expectedKey: string | undefined,
) {
  if (!validSecret(raw.setupKey, expectedKey))
    throw new DomainError("Clé de configuration invalide.");
  const input = personSchema.parse(raw);
  const config = householdSchema.parse({
    name: raw.householdName,
    currency: "EUR",
    timezone: "Europe/Paris",
  });
  const passwordHash = await hashPassword(input.password);
  return database.transaction(async (tx) => {
    // Global transaction lock also protects concurrent first-run requests.
    await tx.execute(sql`select pg_advisory_xact_lock(741903)`);
    if ((await tx.select().from(installation)).length)
      throw new DomainError("Ce serveur est déjà configuré.");
    const id = randomUUID();
    const userId = await provision(tx, input, passwordHash);
    await tx.insert(household).values({ id, ...config });
    await tx
      .insert(membership)
      .values({ householdId: id, userId, role: "admin" });
    await tx.insert(installation).values({ id: 1, householdId: id });
    return id;
  });
}
export async function createInvitation(
  database: Database,
  actorId: string,
  householdId: string,
  rawEmail: string,
) {
  await requireMembership(database, actorId, householdId, true);
  const email = emailSchema.parse(rawEmail);
  const token = randomBytes(32).toString("base64url");
  await database
    .insert(invitation)
    .values({
      id: randomUUID(),
      householdId,
      email,
      tokenHash: tokenHash(token),
      createdBy: actorId,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
  return token;
}
export async function acceptInvitation(
  database: Database,
  token: string,
  raw: PersonInput,
  actorId?: string,
) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new DomainError("Invitation invalide ou expirée.");
  return database.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invitation)
      .where(eq(invitation.tokenHash, tokenHash(token)))
      .for("update");
    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt <= new Date()
    )
      throw new DomainError("Invitation invalide ou expirée.");
    const email = emailSchema.parse(raw.email);
    if (email !== invite.email)
      throw new DomainError("Utilise l’adresse email de l’invitation.");
    const [existing] = await tx
      .select()
      .from(user)
      .where(eq(user.email, email));
    let userId: string;
    if (existing) {
      if (actorId !== existing.id)
        throw new DomainError(
          "Ce compte existe déjà. Connecte-toi puis rouvre ce lien.",
        );
      userId = existing.id;
    } else {
      const input = personSchema.parse(raw);
      userId = await provision(tx, input, await hashPassword(input.password));
    }
    await tx
      .insert(membership)
      .values({ householdId: invite.householdId, userId, role: "member" })
      .onConflictDoNothing();
    await tx
      .update(invitation)
      .set({ acceptedAt: new Date() })
      .where(eq(invitation.id, invite.id));
  });
}
export async function updateHousehold(
  database: Database,
  actorId: string,
  householdId: string,
  raw: unknown,
) {
  await requireMembership(database, actorId, householdId, true);
  await database
    .update(household)
    .set(householdSchema.parse(raw))
    .where(eq(household.id, householdId));
}
export async function revokeInvitation(
  database: Database,
  actorId: string,
  householdId: string,
  id: string,
) {
  await requireMembership(database, actorId, householdId, true);
  await database
    .update(invitation)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitation.id, id), eq(invitation.householdId, householdId)));
}
export async function removeMember(
  database: Database,
  actorId: string,
  householdId: string,
  targetId: string,
) {
  await requireMembership(database, actorId, householdId, true);
  if (actorId === targetId)
    throw new DomainError("Tu ne peux pas te retirer toi-même.");
  // Initial UI only invites members. Administrators cannot be removed here.
  await database
    .delete(membership)
    .where(
      and(
        eq(membership.householdId, householdId),
        eq(membership.userId, targetId),
        eq(membership.role, "member"),
      ),
    );
}
