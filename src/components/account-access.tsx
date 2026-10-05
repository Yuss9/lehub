import { and, eq, gt, desc } from "drizzle-orm";
import { db } from "@/db";
import { session, pushSubscription, household } from "@/db/schema";
import { deviceLabel } from "@/lib/device-label";
import { MutationForm } from "./form";
import { accountAccessAction } from "@/app/account-actions";
export async function accountAccessData(actor: string) {
  const [sessions, devices] = await Promise.all([
    db.select({ id: session.id, agent: session.userAgent, date: session.updatedAt }).from(session).where(and(eq(session.userId, actor), gt(session.expiresAt, new Date()))).orderBy(desc(session.updatedAt)).limit(100),
    db.select({ id: pushSubscription.id, label: pushSubscription.label, home: household.name, date: pushSubscription.createdAt }).from(pushSubscription).innerJoin(household, eq(household.id, pushSubscription.householdId)).innerJoin(session, and(eq(session.id, pushSubscription.sessionId), gt(session.expiresAt, new Date()))).where(eq(pushSubscription.userId, actor)).orderBy(desc(pushSubscription.createdAt)).limit(100),
  ]);
  return { sessions, devices };
}
export function AccountAccess({ data, currentSession, timezone }: { data: Awaited<ReturnType<typeof accountAccessData>>; currentSession: string; timezone: string }) {
  const { sessions, devices } = data;
  return <section className="panel space-y-4">
    <h2 className="text-lg font-semibold">Mes sessions et appareils</h2>
    <p className="text-sm text-muted-foreground">Retire les accès que tu ne reconnais plus. Révoquer une session retire aussi les notifications qui lui sont liées. Un appareil push est retiré de tous tes foyers.</p>
    <h3 className="font-medium">Sessions actives</h3>
    {sessions.map((s) => <div key={s.id} className="rounded-xl border p-3 space-y-2">
      <p className="text-sm break-words">{deviceLabel(s.agent)}{s.id === currentSession && " · Cette session"}</p>
      <p className="text-xs text-muted-foreground">Dernière actualisation : {s.date.toLocaleString("fr-FR", { timeZone: timezone })}</p>
      {s.id !== currentSession && <MutationForm compact action={accountAccessAction} label="Révoquer cette session"><input type="hidden" name="kind" value="session" /><input type="hidden" name="id" value={s.id} /></MutationForm>}
    </div>)}
    <h3 className="font-medium">Appareils de notification</h3>
    {!devices.length && <p className="text-sm text-muted-foreground">Aucun appareil inscrit.</p>}
    {devices.map((d) => <div key={d.id} className="rounded-xl border p-3 space-y-2"><p className="text-sm break-words">{d.label} · {d.home}</p><p className="text-xs text-muted-foreground">Inscrit le {d.date.toLocaleString("fr-FR", { timeZone: timezone })}</p><MutationForm compact action={accountAccessAction} label="Retirer cet appareil de mes foyers"><input type="hidden" name="kind" value="device" /><input type="hidden" name="id" value={d.id} /></MutationForm></div>)}
  </section>;
}
