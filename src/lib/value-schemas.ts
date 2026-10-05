import { z } from "zod";
export const moneySchema = z
  .string()
  .default("")
  .transform((raw, ctx) => {
    const value = raw.trim().replace(",", ".");
    if (!value) return null;
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) {
      ctx.addIssue({
        code: "custom",
        message: "Montant invalide (maximum 2 décimales).",
      });
      return z.NEVER;
    }
    const [whole, fraction = ""] = value.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  });
export const tagsSchema = z
  .string()
  .max(500)
  .default("")
  .transform((raw) =>
    [
      ...new Set(
        raw
          .split(",")
          .map((t) => t.trim().toLocaleLowerCase("fr"))
          .filter(Boolean),
      ),
    ]
      .slice(0, 10)
      .map((t) => t.slice(0, 40))
      .join(", "),
  );
export const revisionSchema = z.coerce.number().int().min(0);
export const moneyInput = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2);
export const moneyLabel = (cents: number | null, currency: string) =>
  cents == null
    ? "Non renseigné"
    : new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(
        cents / 100,
      );
