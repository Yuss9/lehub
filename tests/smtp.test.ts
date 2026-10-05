import { it, expect } from "vitest";
import { SMTPServer } from "smtp-server";
import { sendMail } from "@/lib/mail";
it("delivers through a real local SMTP socket using the production transport", async () => {
  let received = "";
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, session, callback) {
      expect(session.envelope.rcptTo[0].address).toBe("receiver@example.test");
      stream.on("data", (chunk) => {
        received += chunk.toString();
      });
      stream.on("end", () => callback());
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const env = { ...process.env };
  try {
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(
      (server.server.address() as { port: number }).port,
    );
    process.env.SMTP_FROM = "lehub@example.test";
    process.env.SMTP_ALLOW_PLAINTEXT = "true";
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    await sendMail("receiver@example.test", "Test lehub", "Un rappel de test.");
    expect(received).toContain("Subject: Test lehub");
    expect(received).toContain("Un rappel de test.");
    // Production TLS policy must reject this plaintext-only test relay.
    process.env.SMTP_ALLOW_PLAINTEXT = "false";
    await expect(
      sendMail("receiver@example.test", "Refus TLS", "Texte"),
    ).rejects.toThrow();
  } finally {
    for (const key of [
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_FROM",
      "SMTP_ALLOW_PLAINTEXT",
      "SMTP_USER",
      "SMTP_PASSWORD",
    ]) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    await new Promise<void>((resolve) => server.close(resolve));
  }
});

it("negotiates verified STARTTLS with the production transport over a real socket", async () => {
  const { mkdtemp, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const folder = await mkdtemp(join(tmpdir(), "lehub-smtp-tls-"));
  const key = join(folder, "key.pem"), cert = join(folder, "cert.pem");
  let server: SMTPServer | undefined;
  let secured = false, received = "";
  try {
    await run("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1", "-keyout", key, "-out", cert]);
    server = new SMTPServer({ key: await readFile(key), cert: await readFile(cert), authOptional: true, onData(stream, session, callback) { secured = session.secure; stream.on("data", (bytes) => { received += bytes.toString(); }); stream.on("end", () => callback()); } });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    await run(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "import { sendMail } from './src/lib/mail.ts'; await sendMail('receiver@example.test', 'STARTTLS lehub', 'Transport chiffre et certificat verifie.');"], { env: { ...process.env, NODE_EXTRA_CA_CERTS: cert, SMTP_HOST: "127.0.0.1", SMTP_PORT: String((server.server.address() as { port: number }).port), SMTP_FROM: "lehub@example.test", SMTP_ALLOW_PLAINTEXT: "false", SMTP_USER: "", SMTP_PASSWORD: "" }, timeout: 30000 });
    expect(secured).toBe(true); expect(received).toContain("Subject: STARTTLS lehub");
  } finally { if (server) await new Promise<void>((resolve) => server!.close(resolve)); await rm(folder, { recursive: true, force: true }); }
});
