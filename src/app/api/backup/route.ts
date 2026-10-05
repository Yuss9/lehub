import { optionalContext } from "@/lib/context";
import { sameOrigin } from "@/lib/http";
import { exportBackup, importBackup, inspectBackup } from "@/lib/backup";
import { DomainError } from "@/lib/domain";
import { db } from "@/db";
import { revalidatePath } from "next/cache";
export const runtime = "nodejs";
export async function GET() {
  const context = await optionalContext();
  if (!context) return new Response("Connexion requise", { status: 401 });
  try {
    const bytes = await exportBackup(db, context.user.id, context.household.id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="lehub-sauvegarde.zip"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof DomainError
            ? error.message
            : "Sauvegarde indisponible. Réessaie.",
      },
      { status: 400 },
    );
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return new Response("Origine refusée", { status: 403 });
  const context = await optionalContext();
  if (!context) return new Response("Connexion requise", { status: 401 });
  if (context.membership.role !== "admin")
    return new Response("Administrateur requis", { status: 403 });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    let size = 0;
    const parts: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 101 * 1024 * 1024) {
        await reader.cancel();
        throw new DomainError("Archive limitée à 100 Mo.");
      }
      parts.push(value);
    }
    const form = await new Response(Buffer.concat(parts), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File))
      throw new DomainError("Choisis une archive ZIP.");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (form.get("confirmation") !== "RESTAURER") {
      const { data } = inspectBackup(bytes);
      return Response.json(
        {
          preview: {
            name: data.household.name,
            rooms: data.rooms.length,
            equipments: data.equipments.length,
            tasks: data.tasks.length,
            documents: data.documents.length,
          },
        },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const result = await importBackup(
      db,
      context.user.id,
      context.household.id,
      bytes,
    );
    revalidatePath("/", "layout");
    return Response.json(
      { success: "Foyer restauré.", ...result },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof DomainError
            ? error.message
            : "Archive invalide ou restauration impossible. Aucune modification enregistrée.",
      },
      { status: 400 },
    );
  }
}
