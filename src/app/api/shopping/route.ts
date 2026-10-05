import { optionalContext } from "@/lib/context";
import { shoppingState } from "@/lib/shopping-state";
import { sameOrigin, boundedJson } from "@/lib/http";
import { applyShoppingMutation } from "@/lib/shopping-domain";
import { db } from "@/db";
import { DomainError } from "@/lib/domain";
export async function GET() {
  const context = await optionalContext();
  if (!context)
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  return Response.json(await shoppingState(context.household, context.user), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: "Origine non autorisée." }, { status: 403 });
  const context = await optionalContext();
  if (!context)
    return Response.json({ error: "Connexion requise." }, { status: 401 });
  const { household, user } = context;
  try {
    const body = await boundedJson(request);
    if (body.scope !== `${user.id}:${household.id}`)
      return Response.json(
        { error: "Le foyer actif a changé. Reconnecte-toi." },
        { status: 409 },
      );
    await applyShoppingMutation(db, user.id, household.id, body.mutation);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof DomainError
            ? error.message
            : "Vérifie les champs de cet article.",
      },
      { status: error instanceof DomainError ? 409 : 400 },
    );
  }
}
