import { z } from "zod";

export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());
export const personSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: z
    .string()
    .min(12, "Le mot de passe doit contenir au moins 12 caractères.")
    .max(128),
});
export const householdSchema = z.object({
  name: z.string().trim().min(1).max(80),
  currency: z
    .string()
    .length(3)
    .refine(
      (value) => Intl.supportedValuesOf("currency").includes(value),
      "Devise invalide.",
    ),
  timezone: z
    .string()
    .min(1)
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("fr", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Fuseau horaire invalide."),
});
export type PersonInput = z.infer<typeof personSchema>;
