import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { getAuth } from "./auth";
import { db } from "@/db";
import { household, membership } from "@/db/schema";

export async function optionalContext() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  // One active household in this release; deterministic selection, never an ID
  // trusted from the client. The membership is checked on every request.
  const [context] = await db
    .select({ household, membership })
    .from(membership)
    .innerJoin(household, eq(household.id, membership.householdId))
    .where(eq(membership.userId, session.user.id))
    .orderBy(asc(membership.createdAt), asc(household.id))
    .limit(1);
  if (!context) return null;
  return { ...context, user: session.user };
}

export async function getContext() {
  const context = await optionalContext();
  if (!context) redirect("/login?reason=membership");
  return context;
}
