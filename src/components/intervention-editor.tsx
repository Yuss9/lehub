import { MutationForm, Field } from "./form";
import { operationsAction } from "@/app/operations-actions";
import { Select } from "./home-ui";
import { moneyInput } from "@/lib/value-schemas";
import type { intervention } from "@/db/schema";
export function InterventionEditor({
  entry,
}: {
  entry: Pick<
    typeof intervention.$inferSelect,
    | "id"
    | "revision"
    | "completedOn"
    | "scheduledOn"
    | "notes"
    | "costCents"
    | "outcome"
  >;
}) {
  return (
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm text-primary">
        Corriger l’intervention
      </summary>
      <MutationForm action={operationsAction} label="Enregistrer la correction">
        <input type="hidden" name="operation" value="history" />
        <input type="hidden" name="id" value={entry.id} />
        <input type="hidden" name="revision" value={entry.revision} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Date de l’intervention"
            name="completedOn"
            type="date"
            defaultValue={entry.completedOn}
            required
          />
          <Field
            label="Échéance d’origine"
            name="scheduledOn"
            type="date"
            defaultValue={entry.scheduledOn}
            required
          />
          <Field
            label="Coût"
            name="cost"
            defaultValue={moneyInput(entry.costCents)}
            inputMode="decimal"
          />
          <Select
            label="Résultat"
            name="outcome"
            value={entry.outcome}
            required
            options={[
              { id: "completed", name: "Réalisée" },
              { id: "skipped", name: "Ignorée" },
              { id: "cancelled", name: "Annulée (saisie erronée)" },
            ]}
          />
        </div>
        <Field
          label="Notes de l’intervention"
          name="notes"
          defaultValue={entry.notes}
          maxLength={4000}
        />
        <p className="text-xs text-muted-foreground">
          La correction conserve l’auteur et ne modifie pas le planning. Une
          saisie annulée reste visible et est exclue des dépenses.
        </p>
      </MutationForm>
    </details>
  );
}
