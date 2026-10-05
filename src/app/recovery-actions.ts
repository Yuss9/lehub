"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { issueReset, resetPassword, recoveryAllowed } from "@/lib/recovery";
import { mailConfigured, sendMail } from "@/lib/mail";
import { emailSchema } from "@/lib/validation";
import type { ActionState } from "./actions";
export async function requestResetAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const generic = {
    success:
      "Si ce compte existe et que l’envoi est configuré, un lien valable 30 minutes sera envoyé.",
  };
  try {
    const email = emailSchema.parse(form.get("email"));
    const ip =
      (await headers()).get("x-forwarded-for")?.split(",")[0] || "local";
    if (
      !(await recoveryAllowed(db, `ip:${ip}`)) ||
      !(await recoveryAllowed(db, `email:${email}`)) ||
      !mailConfigured()
    )
      return generic;
    const token = await issueReset(db, email);
    if (token)
      await sendMail(
        email,
        "lehub — retrouver ton accès",
        `Pour choisir un nouveau mot de passe, ouvre ce lien :\n${new URL(`/reset-password?token=${token}`, process.env.BETTER_AUTH_URL)}\n\nIl expire dans 30 minutes et ne peut être utilisé qu’une fois. Si tu n’as rien demandé, ignore ce message.`,
      );
  } catch {
    /* Never disclose whether an email is registered or reveal SMTP errors. */
  }
  return generic;
}
export async function resetPasswordAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    if (form.get("password") !== form.get("confirmation"))
      return { error: "Les mots de passe ne correspondent pas." };
    await resetPassword(
      db,
      String(form.get("token") || ""),
      String(form.get("password") || ""),
    );
  } catch {
    return {
      error:
        "Lien invalide ou expiré, ou mot de passe trop court (12 caractères minimum).",
    };
  }
  redirect("/login?reset=1");
}
