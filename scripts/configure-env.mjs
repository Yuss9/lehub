// Dependency-free: runnable with Node or a temporary official Node container.
import { randomBytes, generateKeyPairSync } from "node:crypto";
import { readFile, writeFile, realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export async function configureEnv({ url, email = "", output = ".env" }) {
  const origin = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    (!local && origin.protocol !== "https:") ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw Error(
      "Utilise une URL HTTPS sans chemin, ou http://localhost:3000 pour un essai local.",
    );
  if (email && !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email))
    throw Error("Adresse de contact invalide.");
  const secret = () => randomBytes(32).toString("hex");
  const privateKey = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  }).privateKey.export({ format: "jwk" });
  const vapidPublic = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(privateKey.x, "base64url"),
    Buffer.from(privateKey.y, "base64url"),
  ]).toString("base64url");
  const values = {
    POSTGRES_PASSWORD: secret(),
    BETTER_AUTH_SECRET: secret(),
    SETUP_KEY: secret(),
    BACKUP_ENCRYPTION_KEY: secret(),
    OPERATIONS_HEALTH_TOKEN: secret(),
    BETTER_AUTH_URL: origin.origin,
    LEHUB_DOMAIN: origin.host,
    VAPID_PUBLIC_KEY: vapidPublic,
    VAPID_PRIVATE_KEY: privateKey.d,
    VAPID_SUBJECT: email
      ? `mailto:${email}`
      : origin.protocol === "https:"
        ? origin.origin
        : "",
  };
  const template = await readFile(
    new URL("../.env.example", import.meta.url),
    "utf8",
  );
  const content = template
    .split("\n")
    .map((line) => {
      const name = line.split("=", 1)[0];
      return Object.hasOwn(values, name) ? `${name}=${values[name]}` : line;
    })
    .join("\n");
  await writeFile(output, content, { flag: "wx", mode: 0o600 });
  return path.resolve(output);
}
if (
  process.argv[1] &&
  (await realpath(process.argv[1]).catch(() => "")) ===
    fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  try {
    const allowed = ["--url", "--email", "--output"];
    if (
      args.length % 2 ||
      args.some((v, i) => i % 2 === 0 && !allowed.includes(v))
    )
      throw Error(
        "Usage : node scripts/configure-env.mjs --url https://lehub.example.com [--email toi@example.com] [--output .env]",
      );
    const options = Object.fromEntries(
      args.reduce(
        (pairs, value, i) =>
          i % 2 === 0 ? [...pairs, [value.slice(2), args[i + 1]]] : pairs,
        [],
      ),
    );
    if (!options.url) throw Error("--url est obligatoire.");
    const output = await configureEnv(options);
    console.log(
      `Configuration créée : ${output}. Aucun fichier existant n’est écrasé. Renseigne SMTP et la destination distante avant d’activer ces services.`,
    );
  } catch (error) {
    console.error(
      error.code === "EEXIST"
        ? "Le fichier existe déjà : conserve ses secrets et modifie-le manuellement."
        : error.message,
    );
    process.exitCode = 1;
  }
}
