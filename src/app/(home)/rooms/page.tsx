import { getContext } from "@/lib/context";
import { homeData } from "@/lib/home-data";
import { Field } from "@/components/form";
import {
  PageHeader,
  Editor,
  EntityForm,
  Action,
  Empty,
  Jump,
} from "@/components/home-ui";
export default async function RoomsPage() {
  const { household } = await getContext();
  const { rooms, equipments } = await homeData(household.id);
  return (
    <>
      <PageHeader
        title="Pièces"
        description="Une place pour chaque chose. Organise les pièces de ton foyer."
      />
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
                  {
                    equipments.filter((e) => e.roomId === r.id && !e.archived)
                      .length
                  }{" "}
                  équipements
                </Jump>
              </div>
              <Action
                entity="room"
                id={r.id}
                operation={r.archived ? "restore" : "archive"}
                label={r.archived ? "Restaurer" : "Archiver"}
              />
            </div>
            <Editor title="Modifier la pièce">
              <EntityForm entity="room" id={r.id}>
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
    </>
  );
}
