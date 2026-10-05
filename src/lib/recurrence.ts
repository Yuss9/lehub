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
