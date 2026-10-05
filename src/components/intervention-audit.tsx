import type { interventionCorrection } from "@/db/schema";
import { moneyLabel } from "@/lib/value-schemas";
const fields = { completedOn: "Date", scheduledOn: "Échéance d’origine", notes: "Notes", costCents: "Coût", outcome: "Résultat" };
export function InterventionAudit({ rows, timezone, currency }: { rows: (typeof interventionCorrection.$inferSelect)[]; timezone: string; currency: string }) {
  const value = (key: string, v: unknown) => key === "costCents" ? moneyLabel(typeof v === "number" ? v : null, currency) : key === "outcome" ? ({ completed: "Réalisée", skipped: "Ignorée", cancelled: "Annulée" }[String(v)] || String(v)) : String(v ?? "—");
  if (!rows.length) return null;
  return <details className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">Trace des corrections</summary><ol className="space-y-4">{rows.map((r) => <li key={r.id} className="rounded-xl border p-3"><p className="text-sm font-medium">{r.actorName} · {r.correctedAt.toLocaleString("fr-FR", { timeZone: timezone })}</p><dl className="mt-2 space-y-2 text-xs">{Object.entries(fields).filter(([key]) => r.before[key] !== r.after[key]).map(([key, label]) => <div key={key}><dt className="font-medium">{label}</dt><dd className="whitespace-pre-wrap break-words">{value(key, r.before[key])} → {value(key, r.after[key])}</dd></div>)}</dl></li>)}</ol></details>;
}
