import type { maintenance, equipment } from "@/db/schema";
import { Editor, Action, labels } from "./home-ui";
import { Field } from "./form";
import { MaintenanceForm } from "./maintenance-form";
export function MaintenanceCard({
  task,
  equipments,
  current,
}: {
  task: typeof maintenance.$inferSelect;
  equipments: (typeof equipment.$inferSelect)[];
  current: string;
}) {
  return (
    <article id={task.id} className="panel card-enter">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            {task.title}
            {task.archived && " · Archivé"}
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            {equipments.find((e) => e.id === task.equipmentId)?.name || "Foyer"}{" "}
            · {labels[task.frequency]}
            {task.frequency !== "once" && ` · Intervalle ${task.interval}`}
          </p>
        </div>
        <Action
          entity="maintenance"
          id={task.id}
          revision={task.revision}
          operation={task.archived ? "restore" : "archive"}
          label={task.archived ? "Restaurer" : "Archiver"}
        />
      </div>
      {task.notes && (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
          {task.notes}
        </p>
      )}
      {!task.archived && (
        <>
          <Editor title="Marquer comme réalisé">
            <Action
              entity="maintenance"
              id={task.id}
              revision={task.revision}
              operation="complete"
              label="Confirmer la réalisation"
            >
              <input name="expectedDue" type="hidden" value={task.dueOn} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Date de réalisation"
                  name="completedOn"
                  type="date"
                  defaultValue={current}
                  max={current}
                  required
                />
                <Field
                  label="Coût de l’intervention"
                  name="cost"
                  inputMode="decimal"
                  placeholder="0,00"
                />
                <Field
                  label="Compte rendu de l’intervention"
                  name="notes"
                  maxLength={4000}
                />
              </div>
            </Action>
          </Editor>
          <Editor title="Reporter ou ignorer">
            <Action
              entity="maintenance"
              id={task.id}
              revision={task.revision}
              operation="postpone"
              label="Reporter l’échéance"
            >
              <Field
                label="Nouvelle échéance"
                name="dueOn"
                type="date"
                defaultValue={task.dueOn}
                required
              />
            </Action>
            <div className="mt-5">
              <Action
                entity="maintenance"
                id={task.id}
                revision={task.revision}
                operation="skip"
                label="Ignorer cette occurrence"
              >
                <input name="expectedDue" type="hidden" value={task.dueOn} />
                <Field label="Motif" name="notes" maxLength={4000} />
              </Action>
            </div>
          </Editor>
        </>
      )}
      <Editor title="Ajouter une intervention passée">
        <Action
          entity="maintenance"
          id={task.id}
          revision={task.revision}
          operation="history"
          label="Ajouter à l’historique"
        >
          <p className="text-xs text-muted-foreground">
            Le planning actuel est conservé.
          </p>
          <Field
            label="Date de l’intervention passée"
            name="completedOn"
            type="date"
            max={current}
            required
          />
          <Field
            label="Échéance d’origine (facultatif)"
            name="scheduledOn"
            type="date"
          />
          <Field label="Coût" name="cost" inputMode="decimal" />
          <Field label="Compte rendu" name="notes" maxLength={4000} />
        </Action>
      </Editor>
      <Editor title="Modifier le planning">
        <MaintenanceForm value={task} equipments={equipments} today={current} />
      </Editor>
    </article>
  );
}
