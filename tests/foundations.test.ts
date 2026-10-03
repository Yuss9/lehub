import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { db as productionDb } from "@/db";
import {
  acceptInvitation,
  createInvitation,
  requireMembership,
  revokeInvitation,
  removeMember,
  setupHousehold,
  updateHousehold,
} from "@/lib/domain";
import { createAuth } from "@/lib/auth";

const client = new PGlite();
// PGlite uses PostgreSQL's engine; only the transport differs from node-postgres.
const db = drizzle(client, { schema }) as unknown as typeof productionDb;
const key = "a".repeat(64);
const admin = {
  name: "Yuss",
  email: "yuss@example.test",
  password: "a-long-test-password",
  householdName: "La maison",
  setupKey: key,
};
let householdId: string;
let adminId: string;
let memberId: string;
const auth = createAuth(db, {
  baseURL: "http://localhost:3000",
  secret: "b".repeat(64),
});
const request = (path: string, body: unknown, cookie?: string) =>
  auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
        "x-forwarded-for": "127.0.0.1",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
let adminCookie: string;

beforeAll(async () => {
  await client.exec(
    await readFile(
      new URL("../drizzle/0000_cuddly_wasp.sql", import.meta.url),
      "utf8",
    ),
  );
});
afterAll(async () => {
  await client.close();
});

describe("Foyer privé et authentification", () => {
  it("refuse une clé de configuration erronée sans créer de données", async () => {
    await expect(
      setupHousehold(db, { ...admin, setupKey: "wrong" }, key),
    ).rejects.toThrow("Clé");
    expect(await db.select().from(schema.user)).toHaveLength(0);
  });
  it("crée atomiquement un seul foyer et son administrateur", async () => {
    householdId = await setupHousehold(db, admin, key);
    const [user] = await db.select().from(schema.user);
    adminId = user.id;
    expect(
      await requireMembership(db, adminId, householdId, true),
    ).toMatchObject({ role: "admin" });
    await expect(
      setupHousehold(db, { ...admin, email: "second@example.test" }, key),
    ).rejects.toThrow("déjà configuré");
    expect(await db.select().from(schema.user)).toHaveLength(1);
  });
  it("interdit l’inscription publique Better Auth", async () => {
    const response = await request("/sign-up/email", {
      name: "Intrus",
      email: "intrus@example.test",
      password: admin.password,
    });
    expect(response.ok).toBe(false);
    expect(await db.select().from(schema.user)).toHaveLength(1);
  });
  it("authentifie le compte provisionné avec Better Auth", async () => {
    const response = await request("/sign-in/email", {
      email: admin.email,
      password: admin.password,
    });
    expect(response.status).toBe(200);
    adminCookie = response.headers.get("set-cookie")!.split(";")[0];
    expect(adminCookie).toContain("session_token");
    const session = await auth.api.getSession({
      headers: new Headers({ Cookie: adminCookie }),
    });
    expect(session?.user.id).toBe(adminId);
  });
  it("refuse la connexion avec un mauvais mot de passe", async () => {
    expect(
      (
        await request("/sign-in/email", {
          email: admin.email,
          password: "wrong-password",
        })
      ).status,
    ).toBe(401);
  });
  it("refuse les origines étrangères sur les mutations authentifiées", async () => {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-out", {
        method: "POST",
        headers: {
          Origin: "https://foreign.example",
          Cookie: adminCookie,
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
  });
  it("lie l’invitation à un email et interdit sa réutilisation", async () => {
    const token = await createInvitation(
      db,
      adminId,
      householdId,
      "member@example.test",
    );
    const member = {
      name: "Membre",
      email: "member@example.test",
      password: "member-long-password",
    };
    await expect(
      acceptInvitation(db, token, { ...member, email: "wrong@example.test" }),
    ).rejects.toThrow("adresse email");
    await acceptInvitation(db, token, member);
    await expect(acceptInvitation(db, token, member)).rejects.toThrow(
      "invalide ou expirée",
    );
    const [user] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, member.email));
    memberId = user.id;
    expect(await requireMembership(db, memberId, householdId)).toMatchObject({
      role: "member",
    });
  });
  it("refuse les actions administrateur à un membre", async () => {
    await expect(
      createInvitation(db, memberId, householdId, "other@example.test"),
    ).rejects.toThrow("non autorisée");
    await expect(
      updateHousehold(db, memberId, householdId, {
        name: "Changed",
        currency: "CHF",
        timezone: "Europe/Zurich",
      }),
    ).rejects.toThrow("non autorisée");
    await expect(
      removeMember(db, memberId, householdId, adminId),
    ).rejects.toThrow("non autorisée");
  });
  it("isole les foyers pour les lectures et mutations", async () => {
    await db
      .insert(schema.household)
      .values({ id: "foreign", name: "Autre foyer" });
    await expect(requireMembership(db, adminId, "foreign")).rejects.toThrow(
      "non autorisée",
    );
    await expect(
      updateHousehold(db, adminId, "foreign", {
        name: "Intrusion",
        currency: "EUR",
        timezone: "UTC",
      }),
    ).rejects.toThrow("non autorisée");
    const [row] = await db
      .select()
      .from(schema.household)
      .where(eq(schema.household.id, "foreign"));
    expect(row.name).toBe("Autre foyer");
  });
  it("refuse une invitation révoquée ou expirée", async () => {
    const token = await createInvitation(
      db,
      adminId,
      householdId,
      "revoked@example.test",
    );
    const [invite] = await db
      .select()
      .from(schema.invitation)
      .where(eq(schema.invitation.email, "revoked@example.test"));
    await revokeInvitation(db, adminId, householdId, invite.id);
    await expect(
      acceptInvitation(db, token, {
        name: "X",
        email: invite.email,
        password: admin.password,
      }),
    ).rejects.toThrow("invalide ou expirée");
    const expired = await createInvitation(
      db,
      adminId,
      householdId,
      "expired@example.test",
    );
    await db
      .update(schema.invitation)
      .set({ expiresAt: new Date(0) })
      .where(eq(schema.invitation.email, "expired@example.test"));
    await expect(
      acceptInvitation(db, expired, {
        name: "X",
        email: "expired@example.test",
        password: admin.password,
      }),
    ).rejects.toThrow("invalide ou expirée");
  });
  it("rejette un fuseau invalide et enregistre les préférences valides", async () => {
    await expect(
      updateHousehold(db, adminId, householdId, {
        name: "Maison",
        currency: "EUR",
        timezone: "Mars/Olympus",
      }),
    ).rejects.toThrow();
    await updateHousehold(db, adminId, householdId, {
      name: "Chez nous",
      currency: "CHF",
      timezone: "Europe/Zurich",
    });
    const [row] = await db
      .select()
      .from(schema.household)
      .where(eq(schema.household.id, householdId));
    expect(row).toMatchObject({ name: "Chez nous", currency: "CHF" });
  });
  it("révoque immédiatement l’accès du membre retiré et protège l’administrateur", async () => {
    await expect(
      removeMember(db, adminId, householdId, adminId),
    ).rejects.toThrow("toi-même");
    await removeMember(db, adminId, householdId, memberId);
    await expect(requireMembership(db, memberId, householdId)).rejects.toThrow(
      "non autorisée",
    );
    expect(
      await db
        .select()
        .from(schema.membership)
        .where(
          and(
            eq(schema.membership.householdId, householdId),
            eq(schema.membership.userId, adminId),
          ),
        ),
    ).toHaveLength(1);
  });
  it("exige la session du compte existant pour rejoindre avec une invitation", async () => {
    const token = await createInvitation(
      db,
      adminId,
      householdId,
      "member@example.test",
    );
    const input = { name: "", email: "member@example.test", password: "" };
    await expect(acceptInvitation(db, token, input, adminId)).rejects.toThrow(
      "Connecte-toi",
    );
    await acceptInvitation(db, token, input, memberId);
    expect(await requireMembership(db, memberId, householdId)).toBeDefined();
  });
  it("change le mot de passe via Better Auth puis déconnecte", async () => {
    const response = await request(
      "/change-password",
      {
        currentPassword: admin.password,
        newPassword: "another-long-password",
        revokeOtherSessions: true,
      },
      adminCookie,
    );
    expect(response.status).toBe(200);
    const login = await request("/sign-in/email", {
      email: admin.email,
      password: "another-long-password",
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    expect((await request("/sign-out", {}, cookie)).status).toBe(200);
    expect(
      await auth.api.getSession({ headers: new Headers({ Cookie: cookie }) }),
    ).toBeNull();
  });
});
