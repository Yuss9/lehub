import { notFound } from "next/navigation";
import Link from "next/link";
import { getContext } from "@/lib/context";
import { homeData, pageNumber } from "@/lib/home-data";
import { EquipmentForm } from "@/components/equipment-form";
import { UploadForm } from "@/components/upload-form";
import { DocumentCard } from "@/components/document-card";
import { MaintenanceCard } from "@/components/maintenance-card";
import { MaintenanceForm } from "@/components/maintenance-form";
import {
  PageHeader,
  Editor,
  Empty,
  dateLabel,
  Pagination,
} from "@/components/home-ui";
import { moneyLabel } from "@/lib/value-schemas";
import { today } from "@/lib/recurrence";
export default async function EquipmentDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string; page?: string }>;
}) {
  const { household } = await getContext();
  const { id } = await params;
  const query = await searchParams;
  const data = await homeData(household.id, {
    modules: ["equipments", "rooms"],
    equipmentId: id,
  });
  const [docs, tasks, history] = await Promise.all([
    homeData(household.id, {
      modules: ["documents"],
      equipmentId: id,
      primary: "documents",
      page: query.section === "documents" ? pageNumber(query.page) : 1,
    }),
    homeData(household.id, {
      modules: ["tasks"],
      equipmentId: id,
      primary: "tasks",
      archived: true,
      page: query.section === "tasks" ? pageNumber(query.page) : 1,
    }),
    homeData(household.id, {
      modules: ["history"],
      equipmentId: id,
      primary: "history",
      page: query.section === "history" ? pageNumber(query.page) : 1,
    }),
  ]);
  const device = data.equipments[0];
  if (!device) notFound();
  const current = today(household.timezone);
  return (
    <>
      <Link
        href="/equipment"
        className="mb-5 inline-flex min-h-11 items-center text-sm text-primary"
      >
        ← Tous les équipements
      </Link>
      <PageHeader
        title={device.name}
        description={[
          device.brand,
          device.model,
          data.rooms.find((r) => r.id === device.roomId)?.name,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
      <section className="panel mb-6">
        <dl className="grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Date d’achat</dt>
            <dd>{dateLabel(device.purchasedOn)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Garantie</dt>
            <dd>{dateLabel(device.warrantyUntil)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Prix d’achat</dt>
            <dd>{moneyLabel(device.purchasedCents, household.currency)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Vendeur</dt>
            <dd>{device.seller || "Non renseigné"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Numéro de série</dt>
            <dd className="break-all">{device.serial || "Non renseigné"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tags</dt>
            <dd>{device.tags || "Aucun"}</dd>
          </div>
        </dl>
        {device.notes && (
          <p className="mt-5 whitespace-pre-wrap text-sm leading-6">
            {device.notes}
          </p>
        )}
      </section>
      <Editor title="Modifier les détails">
        <EquipmentForm value={device} rooms={data.rooms} />
      </Editor>
      <h2 className="my-6 text-lg font-semibold">Photos et documents</h2>
      <Editor title="Ajouter un document">
        <UploadForm equipments={data.equipments} equipmentId={id} />
      </Editor>
      <Editor title="Ajouter une photo">
        <UploadForm equipments={data.equipments} equipmentId={id} photo />
      </Editor>
      <div className="space-y-5">
        {docs.documents.map((file) => (
          <DocumentCard
            key={file.id}
            file={file}
            equipments={data.equipments}
          />
        ))}
      </div>
      <Pagination
        path={`/equipment/${id}`}
        params={{ section: "documents" }}
        page={docs.page}
        pages={docs.pages}
      />
      <h2 className="my-6 text-lg font-semibold">Entretiens</h2>
      <Editor title="Planifier un entretien">
        <MaintenanceForm
          equipments={data.equipments}
          equipmentId={id}
          today={current}
        />
      </Editor>
      {!tasks.tasks.length && (
        <Empty text="Aucun entretien lié à cet équipement." />
      )}
      <div className="space-y-5">
        {tasks.tasks.map((task) => (
          <MaintenanceCard
            key={task.id}
            task={task}
            equipments={data.equipments}
            current={current}
          />
        ))}
      </div>
      <Pagination
        path={`/equipment/${id}`}
        params={{ section: "tasks" }}
        page={tasks.page}
        pages={tasks.pages}
      />
      <h2 className="my-6 text-lg font-semibold">Historique</h2>
      <div className="panel divide-y">
        {history.history.map((h) => (
          <div key={h.id} className="py-4">
            <p className="text-sm font-medium">
              {h.taskTitle}
              {h.outcome === "skipped" && " · Ignorée"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {dateLabel(h.completedOn)} · {h.author || "Ancien membre"} ·{" "}
              {moneyLabel(h.costCents, household.currency)}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{h.notes}</p>
          </div>
        ))}
        {!history.history.length && (
          <p className="text-sm text-muted-foreground">
            Aucune intervention enregistrée.
          </p>
        )}
      </div>
      <Pagination
        path={`/equipment/${id}`}
        params={{ section: "history" }}
        page={history.page}
        pages={history.pages}
      />
    </>
  );
}
