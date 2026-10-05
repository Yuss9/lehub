"use server";
import { headers, cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { db } from "@/db";
import { getAuth } from "@/lib/auth";
import { formContext } from "@/lib/context";
import {
  acceptInvitation,
  createInvitation,
  DomainError,
  removeMember,
  revokeInvitation,
  setupHousehold,
  updateHousehold,
  createHousehold,
  manageMember,
  requireMembership,
} from "@/lib/domain";

export type ActionState = { error?: string; success?: string; link?: string };
const value = (form: FormData, key: string) => String(form.get(key) ?? "");
function failure(error: unknown): ActionState {
  if (error instanceof DomainError) return { error: error.message };
  if (error instanceof ZodError)
    return {
      error:
        "Vérifie les champs : nom, email, mot de passe (12 caractères minimum), devise et fuseau horaire.",
    };
  return { error: "L’action a échoué. Réessaie dans un instant." };
}
export async function setupAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    await setupHousehold(
      db,
      {
        name: value(form, "name"),
        email: value(form, "email"),
        password: value(form, "password"),
        householdName: value(form, "householdName"),
        setupKey: value(form, "setupKey"),
      },
      process.env.SETUP_KEY,
    );
  } catch (error) {
    return failure(error);
  }
  redirect("/login?created=1");
}
export async function acceptAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  try {
    await acceptInvitation(
      db,
      value(form, "token"),
      {
        name: value(form, "name"),
        email: value(form, "email"),
        password: value(form, "password"),
      },
      session?.user.id,
    );
  } catch (error) {
    return failure(error);
  }
  redirect(session ? "/" : "/login?created=1");
}
export async function householdAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const context = await formContext(form);
    await updateHousehold(db, context.user.id, context.household.id, {
      revision: value(form, "revision"),
      name: value(form, "name"),
      currency: value(form, "currency"),
      timezone: value(form, "timezone"),
    });
    revalidatePath("/", "layout");
    return { success: "Les paramètres du foyer sont enregistrés." };
  } catch (error) {
    return failure(error);
  }
}
export async function inviteAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const context = await formContext(form);
    const token = await createInvitation(
      db,
      context.user.id,
      context.household.id,
      value(form, "email"),
    );
    const link = new URL(
      `/invite/${token}`,
      process.env.BETTER_AUTH_URL,
    ).toString();
    revalidatePath("/settings");
    return {
      success:
        "Invitation créée. Copie ce lien maintenant : il ne sera plus affiché après avoir quitté cette page.",
      link,
    };
  } catch (error) {
    return failure(error);
  }
}
export async function revokeAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const context = await formContext(form);
    await revokeInvitation(
      db,
      context.user.id,
      context.household.id,
      value(form, "id"),
    );
    revalidatePath("/settings");
    return { success: "Invitation révoquée." };
  } catch (error) {
    return failure(error);
  }
}
export async function removeAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const context = await formContext(form);
    await removeMember(
      db,
      context.user.id,
      context.household.id,
      value(form, "userId"),
    );
    revalidatePath("/settings");
    return { success: "Membre retiré du foyer." };
  } catch (error) {
    return failure(error);
  }
}

export async function householdSelectAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const context = await formContext(form);
    const id = z.uuid().parse(form.get("householdId"));
    await requireMembership(db, context.user.id, id);
    (await cookies()).set("lehub-household", id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.BETTER_AUTH_URL?.startsWith("https:"),
      path: "/",
      maxAge: 31536000,
    });
    revalidatePath("/", "layout");
    return {
      success:
        "Foyer sélectionné. Les formulaires des autres onglets doivent être actualisés.",
    };
  } catch (error) {
    return failure(error);
  }
}
export async function householdCreateAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const context = await formContext(form);
    await createHousehold(db, context.user.id, Object.fromEntries(form));
    revalidatePath("/settings");
    return { success: "Foyer créé. Tu peux maintenant le sélectionner." };
  } catch (error) {
    return failure(error);
  }
}
export async function memberRoleAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const context = await formContext(form);
    await manageMember(
      db,
      context.user.id,
      context.household.id,
      value(form, "userId"),
      z.enum(["admin", "member"]).parse(form.get("role")),
    );
    revalidatePath("/", "layout");
    return { success: "Rôle enregistré." };
  } catch (error) {
    return failure(error);
  }
}
