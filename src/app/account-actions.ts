"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { formContext } from "@/lib/context";
import { DomainError } from "@/lib/domain";
import { revokeAccountAccess } from "@/lib/account-security";
import type { ActionState } from "./actions";
export async function accountAccessAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const c = await formContext(form);
    await revokeAccountAccess(db, c.user.id, c.session.id, z.enum(["session", "device"]).parse(form.get("kind")), z.string().min(1).max(200).parse(form.get("id")));
    revalidatePath("/settings");
    return { success: "Accès retiré. Les notifications de cet appareil sont également retirées si sa session est révoquée." };
  } catch (error) { return { error: error instanceof DomainError ? error.message : "Accès non modifié. Actualise la page et réessaie." }; }
}
