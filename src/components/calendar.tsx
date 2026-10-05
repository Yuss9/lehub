import Link from "next/link";
import type { maintenance } from "@/db/schema";
import { occurrencesInMonth, dateSchema } from "@/lib/recurrence";
export function Calendar({
  month,
  tasks,
  current,
}: {
  month: string;
  tasks: (typeof maintenance.$inferSelect)[];
  current: string;
}) {
  const start = `${month}-01`;
  if (!dateSchema.safeParse(start).success) return null;
  const first = new Date(`${start}T00:00:00Z`);
  const length = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const leading = (first.getUTCDay() + 6) % 7;
  const events: {
    date: string;
    task: typeof maintenance.$inferSelect;
    projected: boolean;
  }[] = [];
  for (const task of tasks) {
    for (const date of occurrencesInMonth(task, month))
      events.push({ date, task, projected: date !== task.dueOn });
  }
  return (
    <section className="panel mb-8 p-3! sm:p-6!">
      <div className="mb-4 flex justify-between">
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
          const day = events.filter((e) => e.date === date);
          return (
            <div
              key={date}
              className={`min-h-20 min-w-0 rounded-lg border p-1 sm:min-h-28 sm:p-2 ${date === current ? "border-primary bg-primary/5" : ""}`}
            >
              <span className="text-xs">{i + 1}</span>
              {day.slice(0, 3).map((e) => (
                <Link
                  key={e.task.id}
                  title={`${e.task.title}${e.projected ? " · Prévision" : ""}`}
                  href={`/maintenance?task=${e.task.id}`}
                  className="mt-1 block truncate rounded bg-primary/10 p-1 text-[10px] text-primary"
                >
                  {e.task.title}
                </Link>
              ))}
              {day.length > 3 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  +{day.length - 3}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
