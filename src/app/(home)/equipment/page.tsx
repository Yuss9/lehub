import Link from "next/link";
import Image from "next/image";
import { getContext } from "@/lib/context";
import { homeData } from "@/lib/home-data";
import { EquipmentForm } from "@/components/equipment-form";
import { UploadForm } from "@/components/upload-form";
import {
  PageHeader,
  Editor,
  Action,
  Empty,
  SearchForm,
  dateLabel,
} from "@/components/home-ui";
export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; room?: string; archived?: string }>;
}) {
  const { household } = await getContext();
  const data = await homeData(household.id);
  const params = await searchParams;
  const query = (params.q || "").toLocaleLowerCase("fr");
  const equipments = data.equipments.filter(
    (e) =>
      (params.archived === "1" || !e.archived) &&
      (!params.room || e.roomId === params.room) &&
      [e.name, e.brand, e.model, e.serial, e.notes]
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(query),
  );
  return (
    <>
      <PageHeader
        title="Équipements"
        description="Détails, photos et garanties : tout ce qui fait vivre ta maison."
      />
      <SearchForm action="/equipment" query={params.q} />
      <form className="mb-6 flex flex-wrap items-center gap-3">
        <label className="text-sm">
          Pièce{" "}
          <select
            name="room"
            defaultValue={params.room || ""}
            className="min-h-11 rounded-xl border bg-surface px-3"
          >
            <option value="">Toutes</option>
            {data.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            name="archived"
            type="checkbox"
            value="1"
            defaultChecked={params.archived === "1"}
          />{" "}
          Inclure les archives
        </label>
        <button className="min-h-11 px-3 text-sm text-primary">Filtrer</button>
      </form>
      <Editor title="Ajouter un équipement" open={!data.equipments.length}>
        <EquipmentForm rooms={data.rooms} />
      </Editor>
      {!equipments.length && (
        <Empty text="Aucun équipement ici. Ajoute un appareil ou ajuste tes filtres." />
      )}
      <div className="space-y-5">
        {equipments.map((e) => (
          <article
            id={e.id}
            key={e.id}
            className="panel card-enter scroll-mt-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">
                  {data.rooms.find((r) => r.id === e.roomId)?.name ||
                    "Sans pièce"}
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  {e.name}
                  {e.archived && " · Archivé"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {[e.brand, e.model].filter(Boolean).join(" · ") ||
                    "Détails à compléter"}
                </p>
              </div>
              <Action
                entity="equipment"
                id={e.id}
                operation={e.archived ? "restore" : "archive"}
                label={e.archived ? "Restaurer" : "Archiver"}
              />
            </div>
            <dl className="my-6 grid gap-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Achat</dt>
                <dd className="mt-1">{dateLabel(e.purchasedOn)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Garantie jusqu’au</dt>
                <dd className="mt-1">{dateLabel(e.warrantyUntil)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Numéro de série</dt>
                <dd className="mt-1 break-all">
                  {e.serial || "Non renseigné"}
                </dd>
              </div>
            </dl>
            {e.notes && (
              <p className="mb-5 whitespace-pre-wrap text-sm leading-6">
                {e.notes}
              </p>
            )}
            <div className="mb-5 flex flex-wrap items-start gap-3">
              {data.documents
                .filter((d) => d.equipmentId === e.id)
                .map((d) => (
                  <Link
                    key={d.id}
                    href={`/api/documents/${d.id}`}
                    className="rounded-xl border p-3 text-sm text-primary"
                  >
                    {d.category === "photo" && (
                      <Image
                        unoptimized
                        width={192}
                        height={144}
                        src={`/api/documents/${d.id}?preview=1`}
                        alt={d.title}
                        loading="lazy"
                        className="mb-2 h-36 w-48 rounded-lg object-cover"
                      />
                    )}
                    {d.title}
                  </Link>
                ))}
            </div>
            <Editor title="Modifier les détails">
              <EquipmentForm value={e} rooms={data.rooms} />
            </Editor>
            <Editor title="Ajouter une photo">
              <UploadForm
                equipments={data.equipments}
                equipmentId={e.id}
                photo
              />
            </Editor>
          </article>
        ))}
      </div>
    </>
  );
}
