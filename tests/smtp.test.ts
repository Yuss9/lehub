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
