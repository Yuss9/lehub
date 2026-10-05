import { and, eq, gt, ne } from "drizzle-orm";
import type { db as productionDb } from "@/db";
import { session, pushSubscription } from "@/db/schema";
import { DomainError } from "./domain";
type Database = typeof productionDb;
export async function revokeAccountAccess(database: Database, actor: string, currentSession: string, kind: "session" | "device", id: string) {
  await database.transaction(async (tx) => {
    const [active] = await tx.select().from(session).where(and(eq(session.id, currentSession), eq(session.userId, actor), gt(session.expiresAt, new Date()))).for("share");
    if (!active) throw new DomainError("Reconnecte-toi pour gérer tes accès.");
    if (kind === "session") {
      const rows = await tx.delete(session).where(and(eq(session.id, id), eq(session.userId, actor), ne(session.id, currentSession))).returning({ id: session.id });
      if (!rows.length) throw new DomainError("Cette session n’est plus active ou correspond à cet appareil.");
    } else {
      const [device] = await tx.select().from(pushSubscription).where(and(eq(pushSubscription.id, id), eq(pushSubscription.userId, actor)));
      if (!device) throw new DomainError("Cet appareil n’est plus inscrit.");
      await tx.delete(pushSubscription).where(and(eq(pushSubscription.userId, actor), eq(pushSubscription.endpoint, device.endpoint)));
    }
  });
}
