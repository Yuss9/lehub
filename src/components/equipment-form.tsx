import type { equipment, room } from "@/db/schema";
import { moneyInput } from "@/lib/value-schemas";
import { Field } from "./form";
import { EntityForm, Select } from "./home-ui";
export function EquipmentForm({
  value,
  rooms,
}: {
  value?: typeof equipment.$inferSelect;
  rooms: (typeof room.$inferSelect)[];
}) {
  return (
    <EntityForm
      entity="equipment"
      id={value?.id}
      revision={value?.revision}
      label={value ? "Enregistrer" : "Ajouter l’équipement"}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Nom de l’équipement"
          name="name"
          required
          maxLength={120}
          defaultValue={value?.name}
        />
        <Select
          label="Pièce"
          name="roomId"
          value={value?.roomId}
          options={rooms.filter((r) => !r.archived || r.id === value?.roomId)}
        />
        <Field
          label="Marque"
          name="brand"
          defaultValue={value?.brand || ""}
          maxLength={120}
        />
        <Field
          label="Modèle"
          name="model"
          defaultValue={value?.model || ""}
          maxLength={120}
        />
        <Field
          label="Numéro de série"
          name="serial"
          defaultValue={value?.serial || ""}
          maxLength={120}
        />
        <Field
          label="Date d’achat"
          name="purchasedOn"
          type="date"
          defaultValue={value?.purchasedOn || ""}
        />
        <Field
          label="Fin de garantie"
          name="warrantyUntil"
          type="date"
          defaultValue={value?.warrantyUntil || ""}
        />
        <Field
          label="Prix d’achat"
          name="purchasedCents"
          inputMode="decimal"
          defaultValue={moneyInput(value?.purchasedCents)}
        />
        <Field
          label="Vendeur"
          name="seller"
          maxLength={120}
          defaultValue={value?.seller || ""}
        />
        <Field
          label="Tags"
          name="tags"
          maxLength={500}
          defaultValue={value?.tags || ""}
          hint="Séparés par des virgules."
        />
        <Field
          label="Notes"
          name="notes"
          defaultValue={value?.notes || ""}
          maxLength={4000}
        />
      </div>
    </EntityForm>
  );
}
