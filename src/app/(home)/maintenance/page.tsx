import { getContext } from "@/lib/context";
import { homeData, pageNumber, spendingData } from "@/lib/home-data";
import { today } from "@/lib/recurrence";
import { Field } from "@/components/form";
import { MaintenanceForm } from "@/components/maintenance-form";
import { MaintenanceCard } from "@/components/maintenance-card";
import { Calendar } from "@/components/calendar";
import {
  PageHeader,
  Editor,
  Empty,
  dateLabel,
  Pagination,
} from "@/components/home-ui";
import { InterventionEditor } from "@/components/intervention-editor";
import { Select } from "@/components/home-ui";
import { moneyLabel } from "@/lib/value-schemas";
import { db } from "@/db";
import { maintenance } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    archived?: string;
    page?: string;
    view?: string;
    task?: string;
    year?: string;
    equipmentId?: string;
    outcome?: string;
    q?: string;
  }>;
}) {
  const { household } = await getContext();
  const params = await searchParams;
  const current = today(household.timezone);
  const month = /^\d{4}-\d{2}$/.test(params.month || "")
    ? params.month!
    : current.slice(0, 7);
  const historyView = params.view === "history";
  const year = /^\d{4}$/.test(params.year || "") ? params.year : undefined;
  const spending = historyView
    ? await spendingData(household.id, year, params.equipmentId)
    : [];
  const data = await homeData(household.id, {
    modules: historyView
      ? ["history", "equipments"]
      : ["tasks", "equipments", "history"],
    primary: historyView ? "history" : "tasks",
    page: pageNumber(params.page),
    archived: params.archived === "1",
    month: historyView ? undefined : params.month,
    year,
    equipmentId: params.equipmentId,
    outcome: ["completed", "skipped", "cancelled"].includes(
      params.outcome || "",
    )
      ? params.outcome
      : undefined,
    query: params.q,
  });
  const calendarTasks = historyView
    ? []
    : await db
        .select()
        .from(maintenance)
        .where(
          and(
            eq(maintenance.householdId, household.id),
            eq(maintenance.archived, false),
          ),
        );
  const selected =
    !historyView && params.task
      ? await db
          .select()
          .from(maintenance)
          .where(
            and(
              eq(maintenance.id, params.task),
              eq(maintenance.householdId, household.id),
            ),
          )
      : [];
  const tasks = selected.length ? selected : data.tasks;
  const groups = [...new Set(tasks.map((t) => t.dueOn))];
  return (
    <>
      <PageHeader
        title="Entretien"
        description="Planifie, réalise et garde une trace des gestes qui font durer ta maison."
      />
      {!historyView && (
        <>
          <Editor title="Planifier un entretien" open={!calendarTasks.length}>
            <MaintenanceForm equipments={data.equipments} today={current} />
          </Editor>
          <form className="mb-6 flex flex-wrap items-end gap-3">
            <Field
              label="Calendrier par mois"
              name="month"
              type="month"
              defaultValue={month}
            />
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                name="archived"
                type="checkbox"
                value="1"
                defaultChecked={params.archived === "1"}
              />
              Inclure les archives
            </label>
            <button className="min-h-11 text-primary text-sm">Afficher</button>
            <Link
              href="/maintenance"
              className="min-h-11 py-3 text-sm text-primary"
            >
              Toutes les échéances
            </Link>
          </form>
        </>
      )}
      {!historyView && (
        <Calendar month={month} tasks={calendarTasks} current={current} />
      )}
      {!historyView && (
        <>
          {!tasks.length && (
            <Empty text="Aucun entretien pour cette sélection." />
          )}
          {groups.map((date) => (
            <section key={date} className="mb-8">
              <h2 className="mb-4 text-sm font-medium">
                {dateLabel(date)}
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
                  .map((task) => (
                    <MaintenanceCard
                      key={task.id}
                      task={task}
                      equipments={data.equipments}
                      current={current}
                    />
                  ))}
              </div>
            </section>
          ))}
          {!selected.length && (
            <Pagination
              path="/maintenance"
              params={params}
              page={data.page}
              pages={data.pages}
            />
          )}
        </>
      )}
      {historyView && (
        <>
          <form className="panel mb-6 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="view" value="history" />
            <Field
              label="Année"
              name="year"
              defaultValue={year || ""}
              pattern="[0-9]{4}"
              maxLength={4}
              placeholder="Toutes"
            />
            <Select
              label="Équipement"
              emptyLabel="Tous les équipements"
              name="equipmentId"
              value={params.equipmentId}
              options={data.equipments}
            />
            <Select
              label="Résultat"
              emptyLabel="Tous les résultats"
              name="outcome"
              value={params.outcome}
              options={[
                { id: "completed", name: "Réalisée" },
                { id: "skipped", name: "Ignorée" },
                { id: "cancelled", name: "Annulée" },
              ]}
            />
            <Field
              label="Rechercher dans l’historique"
              name="q"
              defaultValue={params.q}
              maxLength={120}
            />
            <button className="min-h-11 text-primary">
              Filtrer l’historique
            </button>
          </form>
          <section className="panel mb-6">
            <h2 className="text-lg font-semibold">Dépenses d’entretien</h2>
            <p className="mt-2 text-sm">
              Total :{" "}
              {moneyLabel(
                spending.reduce((n, r) => n + r.total, 0),
                household.currency,
              )}
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="py-3">Équipement</th>
                    <th>Année</th>
                    <th>Interventions</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {spending.map((row) => (
                    <tr
                      className="border-t"
                      key={`${row.equipmentId}:${row.year}`}
                    >
                      <td className="py-3">{row.name || "Foyer"}</td>
                      <td>{row.year}</td>
                      <td>{row.entries}</td>
                      <td>{moneyLabel(row.total, household.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Les montants non renseignés, interventions ignorées et saisies
              annulées ne contribuent pas au total.
            </p>
          </section>
        </>
      )}
      <section className="mt-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Historique des interventions
          </h2>
          <Link
            href="/maintenance?view=history"
            className="min-h-11 py-3 text-sm text-primary"
          >
            Tout l’historique
          </Link>
        </div>
        {!data.history.length ? (
          <Empty text="Tes interventions apparaîtront ici après réalisation." />
        ) : (
          <div className="divide-y rounded-2xl border bg-surface px-6">
            {data.history.map((h) => (
              <div key={h.id} className="py-5">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    {h.taskTitle || "Intervention"}
                    {h.outcome === "skipped" && " · Ignorée"}
                    {h.outcome === "cancelled" && " · Annulée"}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {dateLabel(h.completedOn)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Prévu le {dateLabel(h.scheduledOn)} ·{" "}
                  {h.author || "Ancien membre"} ·{" "}
                  {moneyLabel(h.costCents, household.currency)}
                </p>
                <InterventionEditor entry={h} />
                {h.notes && (
                  <p className="mt-3 whitespace-pre-wrap text-sm">{h.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
        {historyView && (
          <Pagination
            path="/maintenance"
            params={params}
            page={data.page}
            pages={data.pages}
          />
        )}
      </section>
    </>
  );
}
