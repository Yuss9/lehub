import { it, expect } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ECDH } from "node:crypto";
it("generates private independent secrets and a matching VAPID pair without overwriting configuration", async () => {
  const folder = await mkdtemp(join(tmpdir(), "lehub-env-"));
  try {
    const output = join(folder, ".env");
    const run = (...args: string[]) =>
      promisify(execFile)(process.execPath, [
        "scripts/configure-env.mjs",
        "--output",
        output,
        ...args,
      ]);
    await run(
      "--url",
      "https://lehub.example.com",
      "--email",
      "owner@example.com",
    );
    const original = await readFile(output, "utf8");
    const values = Object.fromEntries(
      original
        .split("\n")
        .filter((line) => /^[A-Z_]+=/.test(line))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1)];
        }),
    );
    const secrets = [
      values.POSTGRES_PASSWORD,
      values.BETTER_AUTH_SECRET,
      values.SETUP_KEY,
      values.BACKUP_ENCRYPTION_KEY,
      values.OPERATIONS_HEALTH_TOKEN,
    ];
    expect(new Set(secrets).size).toBe(5);
    expect(secrets.every((value) => /^[a-f0-9]{64}$/.test(value))).toBe(true);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    const { createECDH } = await import("node:crypto");
    const ecdh = createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(values.VAPID_PRIVATE_KEY, "base64url"));
    expect(
      ECDH.convertKey(ecdh.getPublicKey(), "prime256v1").toString("base64url"),
    ).toBe(values.VAPID_PUBLIC_KEY);
    await expect(run("--url", "https://other.example.com")).rejects.toThrow();
    expect(await readFile(output, "utf8")).toBe(original);
    for (const url of [
      "http://public.example.com",
      "https://lehub.example.com/path",
      "https://name:password@lehub.example.com",
      "https://lehub.example.com/?x=1",
    ])
      await expect(run("--url", url)).rejects.toThrow();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
