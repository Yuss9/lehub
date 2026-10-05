import { it, expect } from "vitest";
import {
  createCipheriv,
  randomBytes,
  createHash,
  randomUUID,
} from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unpackServerBackup } from "@/lib/server-backup";
it("extracts an authenticated encrypted server archive and refuses tampering or overwriting an existing directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lehub-backup-crypto-"));
  const previous = process.env.BACKUP_ENCRYPTION_KEY;
  process.env.BACKUP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  try {
    const input = join(directory, "input");
    await mkdir(input);
    await mkdir(join(input, "documents"));
    const key = randomUUID(),
      original = Buffer.from("Original privé");
    await writeFile(join(input, "documents", key), original);
    await writeFile(
      join(input, "database.dump"),
      "Dummy dump: native restore is tested by the Docker harness.",
    );
    await writeFile(
      join(input, "configuration.json"),
      '{"SMTP_PASSWORD":"private-test-value"}',
    );
    await writeFile(
      join(input, "manifest.json"),
      JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        counts: {},
        files: [
          {
            key,
            size: original.length,
            sha256: createHash("sha256").update(original).digest("hex"),
          },
        ],
      }),
    );
    const tar = join(directory, "payload.tar.gz");
    await promisify(execFile)("tar", [
      "-czf",
      tar,
      "-C",
      input,
      "documents",
      "database.dump",
      "configuration.json",
      "manifest.json",
    ]);
    const nonce = randomBytes(12),
      cipher = createCipheriv(
        "aes-256-gcm",
        Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, "hex"),
        nonce,
      );
    const bytes = Buffer.concat([
      Buffer.from("LEHUBBK1"),
      nonce,
      cipher.update(await readFile(tar)),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    const archive = join(directory, "backup.enc");
    await writeFile(archive, bytes);
    const destination = join(directory, "restored");
    await unpackServerBackup(archive, destination);
    expect(await readFile(join(destination, "documents", key))).toEqual(
      original,
    );
    expect(
      await readFile(join(destination, "configuration.json"), "utf8"),
    ).toContain("private-test-value");
    await expect(unpackServerBackup(archive, destination)).rejects.toThrow();
    bytes[bytes.length - 1] ^= 1;
    await writeFile(archive, bytes);
    await expect(
      unpackServerBackup(archive, join(directory, "tampered")),
    ).rejects.toThrow();
    await expect(
      readFile(join(directory, "tampered", "database.dump")),
    ).rejects.toThrow();
  } finally {
    if (previous === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
    else process.env.BACKUP_ENCRYPTION_KEY = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
