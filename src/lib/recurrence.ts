import { z } from "zod";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Date invalide.");
export function today(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function nextDue(
  base: string,
  frequency: string,
  interval: number,
  anchorDay: number,
) {
  const date = new Date(`${dateSchema.parse(base)}T00:00:00Z`);
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + 7 * interval);
  else if (frequency === "monthly" || frequency === "yearly") {
    date.setUTCDate(1);
    date.setUTCMonth(
      date.getUTCMonth() + interval * (frequency === "yearly" ? 12 : 1),
    );
    const end = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(anchorDay, end));
  } else throw new Error("Récurrence invalide.");
  return date.toISOString().slice(0, 10);
}

/** Project only one month, jumping directly over years of old occurrences. */
export function occurrencesInMonth(
  task: {
    dueOn: string;
    frequency: string;
    interval: number;
    anchorDay: number;
  },
  month: string,
) {
  const start = `${month}-01`;
  if (!dateSchema.safeParse(start).success) return [];
  const first = new Date(`${start}T00:00:00Z`);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const end = last.toISOString().slice(0, 10);
  let date = task.dueOn;
  if (date < start && task.frequency !== "once") {
    const base = new Date(`${date}T00:00:00Z`);
    let jumps = 0;
    if (task.frequency === "weekly")
      jumps = Math.floor(
        (first.getTime() - base.getTime()) / (7 * task.interval * 86400000),
      );
    else
      jumps = Math.floor(
        ((first.getUTCFullYear() - base.getUTCFullYear()) * 12 +
          first.getUTCMonth() -
          base.getUTCMonth()) /
          (task.interval * (task.frequency === "yearly" ? 12 : 1)),
      );
    if (jumps > 0)
      date = nextDue(
        date,
        task.frequency,
        task.interval * jumps,
        task.anchorDay,
      );
  }
  const dates: string[] = [];
  while (date <= end) {
    if (date >= start) dates.push(date);
    if (task.frequency === "once") break;
    try {
      date = nextDue(date, task.frequency, task.interval, task.anchorDay);
    } catch {
      break;
    }
  }
  return dates;
}
