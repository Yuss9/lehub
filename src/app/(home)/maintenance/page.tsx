import { getContext } from "@/lib/context";
import { homeData } from "@/lib/home-data";
import { today } from "@/lib/recurrence";
import { Field } from "@/components/form";
import { MaintenanceForm } from "@/components/maintenance-form";
import {
  PageHeader,
  Editor,
  Action,
  Empty,
  dateLabel,
  labels,
} from "@/components/home-ui";
export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; archived?: string }>;
}) {
  const { household } = await getContext();
  const data = await homeData(household.id);
  const current = today(household.timezone);
  const params = await searchParams;
  const tasks = data.tasks.filter(
    (t) =>
      (params.archived === "1" || !t.archived) &&
      (!params.month || t.dueOn.startsWith(params.month)),
  );
  const groups = [...new Set(tasks.map((t) => t.dueOn))];
  return (
    <>
      <PageHeader
        title="Entretien"
        description="Les bons gestes, au bon moment. Planifie, réalise et garde une trace."
      />
      <Editor title="Planifier un entretien" open={!data.tasks.length}>
        <MaintenanceForm equipments={data.equipments} today={current} />
      </Editor>
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <Field
          label="Calendrier par mois"
          name="month"
          type="month"
          defaultValue={params.month || ""}
        />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            name="archived"
            type="checkbox"
            value="1"
            defaultChecked={params.archived === "1"}
          />{" "}
          Inclure les tâches archivées
        </label>
        <button className="min-h-11 text-sm text-primary">Afficher</button>
      </form>
      {!tasks.length && (
        <Empty text="Aucun entretien prévu pour cette sélection." />
      )}
      {groups.map((date) => (
        <section key={date} className="mb-8">
          <h2 className="mb-4 text-sm font-medium">
            {dateLabel(date)}{" "}
            {date < current && (
              <span className="ml-2 text-danger">En retard</span>
            )}
            {date === current && (
              <span className="ml-2 text-primary">Aujourd’hui</span>
            )}
          </h2>
          <div className="space-y-4">
            {tasks
              .filter((t) => t.dueOn === date)
              .map((t) => (
                <article id={t.id} key={t.id} className="panel card-enter">
                  <div className="flex flex-wrap justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        {t.title}
                        {t.archived && " · Archivé"}
                      </h3>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {data.equipments.find((e) => e.id === t.equipmentId)
                          ?.name || "Foyer"}{" "}
                        · {labels[t.frequency]}
                        {t.frequency !== "once" &&
                          ` · Intervalle ${t.interval}`}
                      </p>
                    </div>
                    <Action
                      entity="maintenance"
                      id={t.id}
                      operation={t.archived ? "restore" : "archive"}
                      label={t.archived ? "Restaurer" : "Archiver"}
                    />
                  </div>
                  {t.notes && (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
                      {t.notes}
                    </p>
                  )}
                  {!t.archived && (
                    <Editor title="Marquer comme réalisé">
                      <Action
                        entity="maintenance"
                        id={t.id}
                        operation="complete"
                        label="Confirmer la réalisation"
                      >
                        <input
                          name="expectedDue"
                          type="hidden"
                          value={t.dueOn}
                        />
                        <Field
                          label="Compte rendu de l’intervention"
                          name="notes"
                          maxLength={4000}
                          placeholder="Filtre remplacé, contrôle effectué…"
                        />
                      </Action>
                    </Editor>
                  )}
                  <Editor title="Modifier le planning">
                    <MaintenanceForm
                      value={t}
                      equipments={data.equipments}
                      today={current}
                    />
                  </Editor>
                </article>
              ))}
          </div>
        </section>
      ))}
      <section className="mt-10">
        <h2 className="mb-5 text-lg font-semibold">
          Historique des interventions
        </h2>
        {!data.history.length ? (
          <Empty text="Tes interventions apparaîtront ici après réalisation." />
        ) : (
          <div className="divide-y rounded-2xl border bg-surface px-6">
            {[...data.history].reverse().map((h) => (
              <div key={h.id} className="py-5">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    {data.tasks.find((t) => t.id === h.maintenanceId)?.title}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {dateLabel(h.completedOn)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Prévu le {dateLabel(h.scheduledOn)}
                </p>
                {h.notes && (
                  <p className="mt-3 whitespace-pre-wrap text-sm">{h.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
