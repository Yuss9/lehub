import Link from "next/link";
import Image from "next/image";
import type { document, equipment } from "@/db/schema";
import { Field } from "./form";
import { Editor, EntityForm, Select, Action, labels } from "./home-ui";
export function DocumentCard({
  file,
  equipments,
}: {
  file: typeof document.$inferSelect;
  equipments: (typeof equipment.$inferSelect)[];
}) {
  return (
    <article id={file.id} className="panel card-enter">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">
            {labels[file.category]} · {Math.ceil(file.size / 1024)} Ko
          </p>
          <h2 className="mt-2 break-words font-semibold">{file.title}</h2>
          <p className="mt-2 break-all text-xs text-muted-foreground">
            {file.originalName}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {equipments.find((e) => e.id === file.equipmentId)?.name || "Foyer"}
            {file.tags && ` · ${file.tags}`}
          </p>
        </div>
        <Action
          entity="document"
          id={file.id}
          revision={file.revision}
          operation="delete"
          label="Supprimer"
        />
      </div>
      {file.category === "photo" && (
        <Image
          unoptimized
          width={240}
          height={160}
          alt={file.title}
          src={`/api/documents/${file.id}?preview=1&v=${file.revision}`}
          className="mt-5 max-h-48 rounded-xl object-cover"
        />
      )}
      <Link
        className="my-4 inline-flex min-h-11 items-center text-sm text-primary"
        href={`/api/documents/${file.id}`}
      >
        Télécharger
      </Link>
      <Editor title="Modifier le document">
        <EntityForm entity="document" id={file.id} revision={file.revision}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Titre"
              name="title"
              defaultValue={file.title}
              required
              maxLength={120}
            />
            <Select
              label="Type de document"
              name="category"
              value={file.category}
              required
              options={["invoice", "receipt", "manual", "photo", "other"].map(
                (id) => ({ id, name: labels[id] }),
              )}
            />
            <Select
              label="Équipement associé"
              name="equipmentId"
              value={file.equipmentId}
              options={equipments}
            />
            <Field
              label="Tags"
              name="tags"
              defaultValue={file.tags}
              maxLength={500}
              hint="Séparés par des virgules."
            />
          </div>
        </EntityForm>
      </Editor>
      <Editor title="Remplacer le fichier">
        <Action
          entity="document"
          id={file.id}
          revision={file.revision}
          operation="replace"
          label="Remplacer"
        >
          <Field
            label="Nouveau fichier"
            name="file"
            type="file"
            required
            accept={
              file.category === "photo"
                ? "image/png,image/jpeg,image/webp"
                : "application/pdf,image/png,image/jpeg,image/webp"
            }
            hint="10 Mo maximum. Le titre et les associations sont conservés."
          />
        </Action>
      </Editor>
      <details className="mt-4 text-xs text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-3">
          Texte reconnu ·{" "}
          {file.ocrStatus === "done"
            ? "Terminé"
            : file.ocrStatus === "error"
              ? "À relancer"
              : "En attente"}
        </summary>
        {file.extractedText && (
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap leading-6">
            {file.extractedText}
          </p>
        )}
        {file.ocrStatus === "error" && (
          <Action
            entity="document"
            id={file.id}
            revision={file.revision}
            operation="ocr"
            label="Relancer la reconnaissance"
          />
        )}
      </details>
    </article>
  );
}
