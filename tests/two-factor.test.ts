import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
import { createAuth } from "@/lib/auth";
import { setupHousehold } from "@/lib/domain";
import { issueReset, resetPassword, resetTwoFactor } from "@/lib/recovery";
import type { db as productionDb } from "@/db";
import * as schema from "@/db/schema";

it("requires confirmed TOTP before enabling, challenges passwords, consumes recovery codes and preserves 2FA after an email reset", async () => {
  const client = await PGlite.create();
  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    const db = drizzle(client, { schema }) as unknown as typeof productionDb;
    const password = "only-for-two-factor-testing";
    await setupHousehold(
      db,
      {
        name: "Yuss",
        email: "twofactor@example.test",
        password,
        householdName: "Maison",
        setupKey: "a".repeat(64),
      },
      "a".repeat(64),
    );
    const auth = createAuth(db, {
      baseURL: "http://localhost:3000",
      secret: "b".repeat(64),
    });
    const cookies = new Map<string, string>();
    const cookie = () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    const call = async (route: string, body: unknown): Promise<Response> => {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth${route}`, {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
            Cookie: cookie(),
          },
          body: JSON.stringify(body),
        }),
      );
      // Keep the production limiter enabled and wait for its actual retry window.
      if (response.status === 429) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Number(response.headers.get("x-retry-after") || 10) * 1000 + 100,
          ),
        );
        return call(route, body);
      }
      for (const item of response.headers.getSetCookie()) {
        const pair = item.split(";", 1)[0];
        const at = pair.indexOf("=");
        cookies.set(pair.slice(0, at), pair.slice(at + 1));
      }
      return response;
    };
    const session = () =>
      auth.api.getSession({ headers: new Headers({ Cookie: cookie() }) });
    expect(
      (
        await call("/sign-in/email", {
          email: "twofactor@example.test",
          password,
        })
      ).status,
    ).toBe(200);
    const oldCookie = cookie();
    expect(
      (
        await call("/two-factor/enable", {
          password: "incorrect",
          method: "totp",
        })
      ).ok,
    ).toBe(false);
    const enrollment = await call("/two-factor/enable", {
      password,
      method: "totp",
    });
    expect(enrollment.ok).toBe(true);
    const { totpURI, backupCodes } = await enrollment.json();
    const secret = new URL(totpURI).searchParams.get("secret")!;
    const [pending] = await db.select().from(schema.twoFactor);
    expect(pending.verified).toBe(false);
    expect(pending.secret).not.toBe(secret);
    expect(pending.backupCodes).not.toContain(backupCodes[0]);
    expect((await db.select().from(schema.user))[0].twoFactorEnabled).toBe(
      false,
    );
    expect(
      (await call("/two-factor/verify-totp", { code: "invalid" })).ok,
    ).toBe(false);
    const otp = createOTP(new TextDecoder().decode(base32.decode(secret)), {
      digits: 6,
      period: 30,
    });
    expect(
      (await call("/two-factor/verify-totp", { code: await otp.totp() })).ok,
    ).toBe(true);
    expect((await db.select().from(schema.user))[0].twoFactorEnabled).toBe(
      true,
    );
    expect(
      await auth.api.getSession({
        headers: new Headers({ Cookie: oldCookie }),
      }),
    ).toBeNull();
    expect(
      (await call("/two-factor/enable", { password, method: "totp" })).ok,
    ).toBe(false);
    await call("/sign-out", {});
    const challenged = await call("/sign-in/email", {
      email: "twofactor@example.test",
      password,
    });
    expect((await challenged.json()).twoFactorRedirect).toBe(true);
    expect(await session()).toBeNull();
    expect(
      (await call("/two-factor/verify-totp", { code: "invalid" })).ok,
    ).toBe(false);
    expect(
      (await call("/two-factor/verify-totp", { code: await otp.totp() })).ok,
    ).toBe(true);
    expect((await session())?.user.twoFactorEnabled).toBe(true);
    await call("/sign-out", {});
    expect(
      (
        await (
          await call("/sign-in/email", {
            email: "twofactor@example.test",
            password,
          })
        ).json()
      ).twoFactorRedirect,
    ).toBe(true);
    expect(
      (await call("/two-factor/verify-backup-code", { code: backupCodes[0] }))
        .ok,
    ).toBe(true);
    expect(await session()).not.toBeNull();
    expect(
      (
        await call("/two-factor/verify-backup-code", {
          code: backupCodes[0],
          disableSession: true,
        })
      ).ok,
    ).toBe(false);
    expect(
      (await call("/two-factor/disable", { password: "incorrect" })).ok,
    ).toBe(false);
    await db.insert(schema.verification).values([
      {
        id: "pending-challenge",
        identifier: "2fa-pending-test",
        value: (await db.select().from(schema.user))[0].id,
        expiresAt: new Date(Date.now() + 60000),
      },
      {
        id: "trusted-device",
        identifier: "trust-device-test",
        value: (await db.select().from(schema.user))[0].id,
        expiresAt: new Date(Date.now() + 60000),
      },
    ]);
    const token = await issueReset(db, "twofactor@example.test");
    await resetPassword(db, token!, "new-password-keeps-the-second-factor");
    expect(await session()).toBeNull();
    expect((await db.select().from(schema.user))[0].twoFactorEnabled).toBe(
      true,
    );
    expect(await db.select().from(schema.twoFactor)).toHaveLength(1);
    await resetTwoFactor(db, "twofactor@example.test");
    expect((await db.select().from(schema.user))[0].twoFactorEnabled).toBe(
      false,
    );
    expect(await db.select().from(schema.twoFactor)).toHaveLength(0);
    expect(await db.select().from(schema.session)).toHaveLength(0);
  } finally {
    await client.close();
  }
}, 60000);
