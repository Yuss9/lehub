import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { DomainError } from "./domain";
import { getAuth } from "./auth";
import { db } from "@/db";
import { household, membership } from "@/db/schema";

export async function optionalContext() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const selected = (await cookies()).get("lehub-household")?.value;
  const contexts = await db
    .select({ household, membership })
    .from(membership)
    .innerJoin(household, eq(household.id, membership.householdId))
    .where(eq(membership.userId, session.user.id))
    .orderBy(asc(membership.createdAt), asc(household.id));
  const context =
    contexts.find((c) => c.household.id === selected) || contexts[0];
  if (!context) return null;
  return { ...context, user: session.user };
}

export async function getContext() {
  const context = await optionalContext();
  if (!context) redirect("/login?reason=membership");
  return context;
}

export async function formContext(form: FormData) {
  const context = await getContext();
  if (form.get("householdScope") !== context.household.id)
    throw new DomainError(
      "Le foyer actif a changé. Actualise la page avant d’enregistrer.",
    );
  return context;
}
