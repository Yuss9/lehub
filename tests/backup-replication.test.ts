import { it, expect, afterEach, vi } from "vitest";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replicateBackup } from "@/lib/backup-replication";
afterEach(() => vi.unstubAllEnvs());
it("copies only an encrypted archive, re-reads remote bytes and rejects corruption", async () => {
  const folder = await mkdtemp(join(tmpdir(), "lehub-rclone-test-"));
  try {
    // A disposable local CLI fixture exercises real child processes and streams;
    // it never contacts a storage provider or reads production rclone credentials.
    await writeFile(join(folder, "rclone"), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const target = path.join(process.env.LEHUB_RCLONE_FIXTURE, 'remote.enc');
if (args[0] === 'copyto') fs.copyFileSync(args[1], target);
else if (args[0] === 'cat') { const bytes = fs.readFileSync(target); if (process.env.LEHUB_RCLONE_TAMPER === 'true') bytes[0] ^= 1; process.stdout.write(bytes); }
else process.exit(1);
`, { mode: 0o700 });
    vi.stubEnv("PATH", `${folder}:${process.env.PATH}`);
    vi.stubEnv("BACKUP_REMOTE", "fixture:lehub/backups");
    vi.stubEnv("RCLONE_CONFIG", join(folder, "dummy.conf"));
    vi.stubEnv("LEHUB_RCLONE_FIXTURE", folder);
    const archive = join(folder, "lehub-server-test.enc");
    await writeFile(archive, Buffer.from("encrypted-test-payload"));
    await replicateBackup(archive);
    expect(await readFile(join(folder, "remote.enc"))).toEqual(await readFile(archive));
    vi.stubEnv("LEHUB_RCLONE_TAMPER", "true");
    await expect(replicateBackup(archive)).rejects.toThrow("Empreinte");
    vi.stubEnv("BACKUP_REMOTE", "/local/only");
    await expect(replicateBackup(archive)).rejects.toThrow("Destination");
  } finally { await rm(folder, { recursive: true, force: true }); }
});
