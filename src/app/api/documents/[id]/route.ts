import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db";
import { document } from "@/db/schema";
import { getContext } from "@/lib/context";
import { readPrivateFile } from "@/lib/files";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await getContext();
  const { id } = await params;
  const [file] = await db
    .select()
    .from(document)
    .where(
      and(
        eq(document.id, id),
        eq(document.householdId, context.household.id),
        isNull(document.deletedAt),
      ),
    );
  if (!file) return new Response("Introuvable", { status: 404 });
  try {
    const buffer = await readPrivateFile(file.storageKey);
    const inline =
      new URL(request.url).searchParams.get("preview") === "1" &&
      file.mime.startsWith("image/");
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": file.mime,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Fichier indisponible", { status: 404 });
  }
}
