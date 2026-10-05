import { db } from "@/db";
import { optionalContext } from "@/lib/context";
import { boundedJson, sameOrigin } from "@/lib/http";
import {
  pushConfigured,
  subscribePush,
  unsubscribePush,
  sendPush,
  subscriptionSchema,
} from "@/lib/push";
import { claimMailTest } from "@/lib/operations";
export async function GET() {
  const context = await optionalContext();
  if (!context) return new Response(null, { status: 401 });
  return Response.json(
    {
      key: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null,
      scope: context.household.id,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const context = await optionalContext();
  if (!context) return new Response(null, { status: 401 });
  try {
    const body = await boundedJson(request);
    if (body.scope !== context.household.id)
      return new Response(null, { status: 409 });
    if (!pushConfigured()) return new Response(null, { status: 503 });
    if (body.operation === "test") {
      await claimMailTest(db, context.user.id);
      await sendPush(db, context.user.id, context.household.id);
    } else if (body.operation === "disable") {
      const endpoint = subscriptionSchema.shape.endpoint.parse(body.endpoint);
      await unsubscribePush(
        db,
        context.user.id,
        context.household.id,
        endpoint,
      );
    } else
      await subscribePush(
        db,
        context.user.id,
        context.household.id,
        body.subscription,
      );
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      {
        error:
          "Notification impossible. Vérifie les autorisations et la configuration ; attends une minute entre deux tests.",
      },
      { status: 400 },
    );
  }
}
