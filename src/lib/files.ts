import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export function detectMime(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return "image/jpeg";
  if (
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  throw new Error("Format non accepté. Utilise PDF, JPEG, PNG ou WebP.");
}
function location(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error("Fichier invalide.");
  return path.join(
    /* turbopackIgnore: true */ process.env.DOCUMENTS_DIR || "./data/documents",
    key,
  );
}
export async function saveFile(file: File, photo = false) {
  if (!file.size || file.size > MAX_FILE_SIZE)
    throw new Error("Le fichier doit peser entre 1 octet et 10 Mo.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = detectMime(buffer);
  if (photo && !mime.startsWith("image/"))
    throw new Error("Une photo doit être une image.");
  const key = randomUUID();
  await mkdir(path.dirname(location(key)), { recursive: true, mode: 0o700 });
  await writeFile(location(key), buffer, { flag: "wx", mode: 0o600 });
  return { storageKey: key, mime, size: buffer.length };
}
export const readPrivateFile = async (key: string) =>
  readFile(/* turbopackIgnore: true */ location(key));
export const removePrivateFile = (key: string) => unlink(location(key));
