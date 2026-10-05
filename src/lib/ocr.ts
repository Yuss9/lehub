import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readPrivateFile } from "./files";
const run = promisify(execFile);
export async function extractText(storageKey: string, mime: string) {
  const folder = await mkdtemp(path.join(tmpdir(), "lehub-ocr-"));
  try {
    const file = path.join(
      folder,
      mime === "application/pdf" ? "input.pdf" : "input.image",
    );
    await writeFile(file, await readPrivateFile(storageKey), { mode: 0o600 });
    const options = { timeout: 30000, maxBuffer: 2 * 1024 * 1024 };
    if (mime === "application/pdf") {
      const { stdout } = await run(
        "pdftotext",
        ["-f", "1", "-l", "10", "-layout", file, "-"],
        options,
      );
      if (stdout.trim().length > 30) return stdout.trim().slice(0, 200000);
      await run(
        "pdftoppm",
        [
          "-f",
          "1",
          "-l",
          "10",
          "-scale-to",
          "2000",
          "-png",
          file,
          path.join(folder, "page"),
        ],
        options,
      );
      const images = (await readdir(folder))
        .filter((p) => p.endsWith(".png"))
        .sort();
      let text = "";
      for (const image of images)
        text +=
          (
            await run(
              "tesseract",
              [path.join(folder, image), "stdout", "-l", "fra+eng"],
              options,
            )
          ).stdout + "\n";
      return text.trim().slice(0, 200000);
    }
    return (
      await run("tesseract", [file, "stdout", "-l", "fra+eng"], options)
    ).stdout
      .trim()
      .slice(0, 200000);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
