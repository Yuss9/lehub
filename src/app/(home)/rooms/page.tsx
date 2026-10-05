import { getContext } from "@/lib/context";
import { homeData, pageNumber } from "@/lib/home-data";
import { db } from "@/db";
import { equipment } from "@/db/schema";
import { and, eq, inArray, count } from "drizzle-orm";
import { Field } from "@/components/form";
import {
  PageHeader,
  Editor,
  EntityForm,
  Action,
  Empty,
  Jump,
  Pagination,
  SearchForm,
} from "@/components/home-ui";
export default async function RoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const params = await searchParams;
  const { household } = await getContext();
  const data = await homeData(household.id, {
    modules: ["rooms"],
    primary: "rooms",
    page: pageNumber(params.page),
    query: params.q,
  });
  const { rooms } = data;
  const counts = rooms.length
    ? await db
        .select({ roomId: equipment.roomId, n: count() })
        .from(equipment)
        .where(
          and(
            eq(equipment.householdId, household.id),
            eq(equipment.archived, false),
            inArray(
              equipment.roomId,
              rooms.map((r) => r.id),
            ),
          ),
        )
        .groupBy(equipment.roomId)
    : [];
  return (
    <>
      <PageHeader
        title="Pièces"
        description="Une place pour chaque chose. Organise les pièces de ton foyer."
      />
      <SearchForm action="/rooms" query={params.q} />
      <Editor title="Créer une pièce" open={!rooms.length}>
        <EntityForm entity="room" label="Créer la pièce">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Nom"
              name="name"
              required
              maxLength={120}
              placeholder="Cuisine"
            />
            <Field
              label="Ordre d’affichage"
              name="position"
              type="number"
              min={0}
              max={10000}
              defaultValue={rooms.length}
            />
            <Field label="Description" name="description" maxLength={4000} />
          </div>
        </EntityForm>
      </Editor>
      {!rooms.length && (
        <Empty text="Commence par ajouter ta première pièce." />
      )}
      <div className="space-y-5">
        {rooms.map((r) => (
          <section
            id={r.id}
            key={r.id}
            className={`panel card-enter ${r.archived ? "opacity-60" : ""}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  {r.name}
                  {r.archived && " · Archivée"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {r.description || "Ton espace, à organiser."}
                </p>
                <Jump href={`/equipment?room=${r.id}`}>
                  {counts.find((c) => c.roomId === r.id)?.n || 0} équipements
                </Jump>
              </div>
              <Action
                entity="room"
                id={r.id}
                revision={r.revision}
                operation={r.archived ? "restore" : "archive"}
                label={r.archived ? "Restaurer" : "Archiver"}
              />
            </div>
            <Editor title="Modifier la pièce">
              <EntityForm entity="room" id={r.id} revision={r.revision}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="Nom"
                    name="name"
                    defaultValue={r.name}
                    required
                  />
                  <Field
                    label="Ordre d’affichage"
                    name="position"
                    type="number"
                    min={0}
                    max={10000}
                    defaultValue={r.position}
                  />
                  <Field
                    label="Description"
                    name="description"
                    defaultValue={r.description}
                  />
                </div>
              </EntityForm>
            </Editor>
          </section>
        ))}
      </div>
      <Pagination
        path="/rooms"
        params={params}
        page={data.page}
        pages={data.pages}
      />
    </>
  );
}
