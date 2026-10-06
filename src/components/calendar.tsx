"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { maintenance } from "@/db/schema";
import { occurrencesInMonth, dateSchema } from "@/lib/recurrence";
import { homeAction } from "@/app/home-actions";
import { Button } from "./ui/button";
type Task = typeof maintenance.$inferSelect;
export function Calendar({
  month,
  tasks,
  current,
  scope,
}: {
  month: string;
  tasks: Task[];
  current: string;
  scope: string;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [day, setDay] = useState<string | null>(null);
  const [move, setMove] = useState<{ task: Task; date: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const open = !!(day || move);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open) dialog.current?.close();
  }, [open]);
  const start = `${month}-01`;
  if (!dateSchema.safeParse(start).success) return null;
  const first = new Date(`${start}T00:00:00Z`);
  const length = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const events = tasks.flatMap((task) =>
    occurrencesInMonth(task, month).map((date) => ({
      date,
      task,
      projected: date !== task.dueOn,
    })),
  );
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(`${date}T00:00:00Z`));
  function close() {
    setDay(null);
    setMove(null);
    setError("");
  }
  return (
    <section className="panel mb-8 p-3! sm:p-6!">
      <div className="mb-4 flex flex-wrap justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {new Intl.DateTimeFormat("fr-FR", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(first)}
        </h2>
        <span className="text-xs text-muted-foreground">
          Les dates futures sont des prévisions.
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Ouvre une journée pour consulter tous ses entretiens ou reporter une
        échéance. Sur ordinateur, tu peux aussi faire glisser une échéance vers
        un autre jour.
      </p>
      <div className="grid grid-cols-7 text-center text-xs text-muted-foreground">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
          <span key={d} className="py-2">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }, (_, i) => (
          <div key={`blank${i}`} />
        ))}
        {Array.from({ length }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const entries = events.filter((e) => e.date === date);
          return (
            <div
              key={date}
              data-date={date}
              onDragOver={(event) => {
                if (
                  event.dataTransfer.types.includes("application/x-lehub-task")
                )
                  event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const task = tasks.find(
                  (t) =>
                    t.id ===
                    event.dataTransfer.getData("application/x-lehub-task"),
                );
                if (task && task.dueOn !== date && !busy) {
                  setDay(null);
                  setError("");
                  setMove({ task, date });
                }
              }}
              className={`min-h-20 min-w-0 rounded-lg border p-1 sm:min-h-28 sm:p-2 ${date === current ? "border-primary bg-primary/5" : ""}`}
            >
              <button
                type="button"
                aria-label={`Voir les entretiens du ${dateLabel(date)}`}
                onClick={() => {
                  setDay(date);
                  setError("");
                }}
                className="flex min-h-11 w-full items-center text-xs hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
              >
                {i + 1}
              </button>
              {entries.slice(0, 3).map((e) => (
                <Link
                  key={e.task.id}
                  title={`${e.task.title}${e.projected ? " · Prévision" : ""}`}
                  prefetch={false}
                  href={`/maintenance?month=${month}&task=${e.task.id}`}
                  draggable={!e.projected}
                  onDragStart={(event) => {
                    if (e.projected) {
                      event.preventDefault();
                      return;
                    }
                    event.dataTransfer.setData(
                      "application/x-lehub-task",
                      e.task.id,
                    );
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  className="mt-1 block truncate rounded bg-primary/10 p-1 text-[10px] text-primary"
                >
                  {e.task.title}
                </Link>
              ))}
              {entries.length > 3 && (
                <button
                  type="button"
                  onClick={() => setDay(date)}
                  aria-label={`Voir les ${entries.length} entretiens du ${dateLabel(date)}`}
                  className="mt-1 min-h-11 w-full text-left text-[10px] text-primary underline"
                >
                  +{entries.length - 3}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {message && (
        <p role="status" className="mt-4 text-sm text-primary">
          {message}
        </p>
      )}
      <dialog
        ref={dialog}
        aria-labelledby={`calendar-title-${scope}`}
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else close();
        }}
        className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border bg-surface p-6 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 id={`calendar-title-${scope}`} className="text-lg font-semibold">
            {move ? "Déplacer l’échéance" : day ? dateLabel(day) : "Entretiens"}
          </h2>
          <Button type="button" variant="ghost" disabled={busy} onClick={close}>
            Fermer
          </Button>
        </div>
        {move ? (
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              const form = new FormData(event.currentTarget);
              form.set("householdScope", scope);
              form.set("entity", "maintenance");
              form.set("operation", "postpone");
              form.set("id", move.task.id);
              form.set("revision", String(move.task.revision));
              try {
                const result = await homeAction({}, form);
                if (result.error) setError(result.error);
                else {
                  close();
                  setMessage(
                    "Échéance déplacée. Le jour de référence de la récurrence est conservé.",
                  );
                  router.refresh();
                }
              } catch {
                setError(
                  "Le serveur est inaccessible. Aucun déplacement n’est confirmé.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="text-sm font-medium">{move.task.title}</p>
            <p className="text-xs text-muted-foreground">
              Les interventions passées et le jour de référence sont conservés.
              Les prévisions suivantes seront recalculées depuis la nouvelle
              échéance, ou la réalisation selon ton réglage.
            </p>
            <label className="block space-y-2 text-sm">
              <span>Nouvelle échéance</span>
              <input
                className="min-h-11 w-full rounded-xl border bg-background px-3"
                aria-label="Nouvelle échéance"
                name="dueOn"
                type="date"
                required
                defaultValue={move.date}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button disabled={busy}>
              {busy ? "Enregistrement…" : "Confirmer le déplacement"}
            </Button>
          </form>
        ) : (
          <ul className="space-y-3">
            {events
              .filter((e) => e.date === day)
              .map((e) => (
                <li key={e.task.id} className="rounded-xl border p-4 text-sm">
                  <Link
                    prefetch={false}
                    href={`/maintenance?month=${month}&task=${e.task.id}`}
                    onClick={close}
                    className="font-medium text-primary"
                  >
                    {e.task.title}
                  </Link>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {e.projected
                      ? "Prévision de récurrence"
                      : "Prochaine échéance"}
                  </p>
                  {!e.projected && (
                    <Button
                      className="mt-3"
                      type="button"
                      variant="outline"
                      onClick={() => setMove({ task: e.task, date: e.date })}
                    >
                      Reporter cette échéance
                    </Button>
                  )}
                </li>
              ))}
            {!events.some((e) => e.date === day) && (
              <li className="text-sm text-muted-foreground">
                Aucun entretien prévu ce jour.
              </li>
            )}
          </ul>
        )}
      </dialog>
    </section>
  );
}
