"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { formContext } from "@/lib/context";
import { DomainError, requireMembership } from "@/lib/domain";
import {
  correctIntervention,
  retryReminder,
  claimMailTest,
} from "@/lib/operations";
import { sendMail } from "@/lib/mail";
import type { ActionState } from "./actions";
export async function operationsAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const c = await formContext(form);
    const operation = z
      .enum(["history", "retry", "smtp"])
      .parse(form.get("operation"));
    if (operation === "history")
      await correctIntervention(
        db,
        c.user.id,
        c.household.id,
        z.uuid().parse(form.get("id")),
        Object.fromEntries(form),
        c.household.timezone,
      );
    if (operation === "retry")
      await retryReminder(
        db,
        c.user.id,
        c.household.id,
        z.uuid().parse(form.get("id")),
      );
    if (operation === "smtp") {
      await requireMembership(db, c.user.id, c.household.id, true);
      await claimMailTest(db, c.user.id);
      await sendMail(
        c.user.email,
        "lehub — test SMTP",
        "L’envoi SMTP de ton installation fonctionne. Cet email a été demandé depuis les paramètres.",
      );
    }
    revalidatePath("/", "layout");
    return {
      success:
        operation === "smtp"
          ? "Email de test envoyé à ton adresse."
          : "C’est enregistré.",
    };
  } catch (error) {
    return {
      error:
        error instanceof DomainError
          ? error.message
          : error instanceof z.ZodError
            ? "Vérifie les dates, le montant et les champs."
            : "Action impossible. Actualise la page ; pour SMTP, vérifie la configuration et les journaux du relais.",
    };
  }
}
