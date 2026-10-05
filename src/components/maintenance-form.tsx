import type { equipment, maintenance } from "@/db/schema";
import { Field } from "./form";
import { EntityForm, Select, labels } from "./home-ui";
export function MaintenanceForm({
  value,
  equipments,
  today,
  equipmentId = "",
}: {
  value?: typeof maintenance.$inferSelect;
  equipments: (typeof equipment.$inferSelect)[];
  today: string;
  equipmentId?: string;
}) {
  return (
    <EntityForm
      entity="maintenance"
      id={value?.id}
      revision={value?.revision}
      label={value ? "Enregistrer" : "Planifier"}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Tâche"
          name="title"
          required
          maxLength={120}
          defaultValue={value?.title}
        />
        <Select
          label="Équipement"
          name="equipmentId"
          options={equipments}
          value={value?.equipmentId || equipmentId}
        />
        <Field
          label="Prochaine échéance"
          name="dueOn"
          type="date"
          defaultValue={value?.dueOn || today}
          required
        />
        <Select
          label="Récurrence"
          name="frequency"
          required
          value={value?.frequency || "once"}
          options={["once", "weekly", "monthly", "yearly"].map((id) => ({
            id,
            name: labels[id],
          }))}
        />
        <Field
          label="Intervalle"
          name="interval"
          type="number"
          required
          min={1}
          max={120}
          defaultValue={value?.interval || 1}
          hint="Exemple : 3 avec « Chaque mois » = tous les 3 mois."
        />
        <Select
          label="Calcul de la prochaine date"
          name="recurrenceMode"
          required
          value={value?.recurrenceMode || "fixed"}
          options={[
            { id: "fixed", name: "Depuis la date prévue" },
            { id: "completion", name: "Depuis la réalisation" },
          ]}
        />
        <Field
          label="Consignes"
          name="notes"
          maxLength={4000}
          defaultValue={value?.notes || ""}
        />
      </div>
    </EntityForm>
  );
}
