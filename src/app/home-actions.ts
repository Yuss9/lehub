"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, sql, isNull } from "drizzle-orm";
import { db } from "@/db";
import { document, reminderPreference } from "@/db/schema";
import { formContext } from "@/lib/context";
import {
  saveEntity,
  changeEntity,
  completeTask,
  setShoppingChecked,
  clearPurchased,
  recordPastIntervention,
  postponeTask,
} from "@/lib/home-domain";
import { uploadDocument, replaceDocument } from "@/lib/document-domain";
import { DomainError } from "@/lib/domain";
import { revisionSchema } from "@/lib/value-schemas";
import type { ActionState } from "./actions";
export async function homeAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const context = await formContext(form);
    const operation = String(form.get("operation") || "save");
    const entity = z
      .enum([
        "room",
        "equipment",
        "maintenance",
        "shoppingList",
        "shoppingItem",
        "document",
      ])
      .parse(form.get("entity"));
    const id = String(form.get("id") || "");
    const revision = form.get("revision");
    if (operation === "upload" && entity === "document") {
      const file = form.get("file");
      if (!(file instanceof File)) throw new DomainError("Choisis un fichier.");
      await uploadDocument(
        context.user.id,
        context.household.id,
        Object.fromEntries(form),
        file,
      );
    } else if (operation === "replace" && entity === "document") {
      const file = form.get("file");
      if (!(file instanceof File)) throw new DomainError("Choisis un fichier.");
      await replaceDocument(
        context.user.id,
        context.household.id,
        id,
        revision,
        file,
      );
    } else if (operation === "text" && entity === "document") {
      const extractedText = z
        .string()
        .max(200000)
        .parse(form.get("extractedText"));
      const rows = await db
        .update(document)
        .set({
          extractedText,
          ocrStatus: "manual",
          ocrFinishedAt: new Date(),
          ocrStartedAt: null,
          ocrError: "",
          revision: sql`${document.revision} + 1`,
        })
        .where(
          and(
            eq(document.id, id),
            eq(document.householdId, context.household.id),
            eq(document.revision, revisionSchema.parse(revision)),
            isNull(document.deletedAt),
          ),
        )
        .returning();
      if (!rows.length)
        throw new DomainError("Le document a changé. Actualise la page.");
    } else if (operation === "ocr" && entity === "document") {
      const changed = await db
        .update(document)
        .set({
          ocrStatus: "pending",
          ocrStartedAt: null,
          ocrFinishedAt: null,
          ocrError: "",
          revision: sql`${document.revision} + 1`,
        })
        .where(
          and(
            eq(document.id, id),
            eq(document.householdId, context.household.id),
            eq(document.revision, revisionSchema.parse(revision)),
            isNull(document.deletedAt),
          ),
        )
        .returning();
      if (!changed.length)
        throw new DomainError("Le document a changé. Actualise la page.");
    } else if (
      (operation === "complete" || operation === "skip") &&
      entity === "maintenance"
    ) {
      await completeTask(
        db,
        context.user.id,
        context.household.id,
        id,
        context.household.timezone,
        String(form.get("notes") || ""),
        String(form.get("expectedDue") || ""),
        {
          revision,
          completedOn: String(form.get("completedOn") || ""),
          cost: String(form.get("cost") || ""),
          outcome: operation === "skip" ? "skipped" : "completed",
        },
      );
    } else if (operation === "history" && entity === "maintenance") {
      await recordPastIntervention(
        db,
        context.user.id,
        context.household.id,
        id,
        context.household.timezone,
        {
          revision,
          completedOn: String(form.get("completedOn") || ""),
          scheduledOn: String(form.get("scheduledOn") || ""),
          cost: String(form.get("cost") || ""),
          notes: String(form.get("notes") || ""),
        },
      );
    } else if (operation === "postpone" && entity === "maintenance") {
      await postponeTask(
        db,
        context.user.id,
        context.household.id,
        id,
        revision,
        form.get("dueOn"),
      );
    } else if (operation === "checked" && entity === "shoppingItem") {
      const checked =
        z.enum(["true", "false"]).parse(form.get("checked")) === "true";
      await setShoppingChecked(
        db,
        context.user.id,
        context.household.id,
        id,
        checked,
      );
    } else if (operation === "clear" && entity === "shoppingList") {
      await clearPurchased(db, context.user.id, context.household.id, id);
    } else if (operation === "save") {
      await saveEntity(
        db,
        context.user.id,
        context.household.id,
        entity,
        id,
        Object.fromEntries(form),
      );
    } else
      await changeEntity(
        db,
        context.user.id,
        context.household.id,
        entity,
        id,
        operation,
        revision,
      );
    revalidatePath("/", "layout");
    return { success: "C’est enregistré." };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { error: error.issues[0]?.message || "Vérifie les champs." };
    if (error instanceof DomainError) return { error: error.message };
    return {
      error:
        "Enregistrement impossible. Vérifie le format et la taille du fichier, puis réessaie.",
    };
  }
}
export async function reminderAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const { household, user } = await formContext(form);
    const leadDays = z.coerce
      .number()
      .int()
      .min(0)
      .max(90)
      .parse(form.get("leadDays"));
    const emailEnabled = form.get("emailEnabled") === "on";
    await db
      .insert(reminderPreference)
      .values({
        householdId: household.id,
        userId: user.id,
        leadDays,
        emailEnabled,
      })
      .onConflictDoUpdate({
        target: [reminderPreference.householdId, reminderPreference.userId],
        set: { leadDays, emailEnabled },
      });
    revalidatePath("/settings");
    return { success: "Tes rappels sont enregistrés." };
  } catch {
    return { error: "Choisis un délai entre 0 et 90 jours." };
  }
}
