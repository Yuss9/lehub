import nodemailer from "nodemailer";
export const mailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM);
export async function sendMail(to: string, subject: string, text: string) {
  if (!mailConfigured()) throw new Error("SMTP non configuré.");
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465 && process.env.SMTP_ALLOW_PLAINTEXT !== "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
    });
  } finally {
    transport.close();
  }
}
