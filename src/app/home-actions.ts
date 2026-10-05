"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { document } from "@/db/schema";
import { getContext } from "@/lib/context";
import {
  saveEntity,
  changeEntity,
  completeTask,
  owned,
} from "@/lib/home-domain";
import { saveFile, removePrivateFile } from "@/lib/files";
import type { ActionState } from "./actions";
export async function homeAction(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const context = await getContext();
  try {
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
    if (operation === "upload" && entity === "document") {
      const title = z.string().trim().min(1).max(120).parse(form.get("title"));
      const category = z
        .enum(["invoice", "receipt", "manual", "photo", "other"])
        .parse(form.get("category"));
      const equipmentId = String(form.get("equipmentId") || "") || null;
      if (equipmentId)
        await owned(db, "equipment", context.household.id, equipmentId);
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("Choisis un fichier.");
      const stored = await saveFile(file, category === "photo");
      try {
        await db
          .insert(document)
          .values({
            id: randomUUID(),
            householdId: context.household.id,
            equipmentId,
            title,
            category,
            originalName: file.name.replace(/[\r\n]/g, "").slice(0, 255),
            ...stored,
          });
      } catch (error) {
        await removePrivateFile(stored.storageKey);
        throw error;
      }
    } else if (operation === "complete" && entity === "maintenance") {
      await completeTask(
        db,
        context.user.id,
        context.household.id,
        id,
        context.household.timezone,
        String(form.get("notes") || ""),
        String(form.get("expectedDue") || ""),
      );
    } else if (operation === "save" && entity !== "document") {
      await saveEntity(
        db,
        context.user.id,
        context.household.id,
        entity,
        id,
        Object.fromEntries(form),
      );
    } else {
      await changeEntity(
        db,
        context.user.id,
        context.household.id,
        entity,
        id,
        operation,
      );
    }
    revalidatePath("/", "layout");
    return { success: "C’est enregistré." };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { error: error.issues[0]?.message || "Vérifie les champs." };
    if (error instanceof Error && !("query" in error) && !("code" in error))
      return { error: error.message };
    return { error: "Enregistrement impossible. Réessaie." };
  }
}
