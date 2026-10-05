import type { equipment } from "@/db/schema";
import { Field } from "./form";
import { EntityForm, Select, labels } from "./home-ui";
export function UploadForm({
  equipments,
  equipmentId = "",
  photo = false,
}: {
  equipments: (typeof equipment.$inferSelect)[];
  equipmentId?: string;
  photo?: boolean;
}) {
  return (
    <EntityForm
      entity="document"
      label={photo ? "Ajouter la photo" : "Déposer le document"}
    >
      <input type="hidden" name="operation" value="upload" />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Tags"
          name="tags"
          maxLength={500}
          hint="Séparés par des virgules."
        />
        <Field label="Titre" name="title" required maxLength={120} />
        <Select
          label="Équipement associé"
          name="equipmentId"
          value={equipmentId}
          options={equipments}
        />
        {photo ? (
          <input type="hidden" name="category" value="photo" />
        ) : (
          <Select
            label="Type de document"
            name="category"
            value="invoice"
            required
            options={Object.entries(labels)
              .filter(([id]) =>
                ["invoice", "receipt", "manual", "photo", "other"].includes(id),
              )
              .map(([id, name]) => ({ id, name }))}
          />
        )}
        <Field
          label={photo ? "Photo" : "Fichier"}
          name="file"
          type="file"
          required
          accept={
            photo
              ? "image/jpeg,image/png,image/webp"
              : "application/pdf,image/jpeg,image/png,image/webp"
          }
          hint="10 Mo maximum. PDF, JPEG, PNG ou WebP. Accès réservé aux membres du foyer."
        />
      </div>
    </EntityForm>
  );
}
