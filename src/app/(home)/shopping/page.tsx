import Link from "next/link";
import { getContext } from "@/lib/context";
import { homeData } from "@/lib/home-data";
import { Field } from "@/components/form";
import { ShoppingToggle } from "@/components/shopping-toggle";
import { SharedRefresh } from "@/components/shared-refresh";
import {
  PageHeader,
  Editor,
  EntityForm,
  Action,
  Empty,
  Select,
} from "@/components/home-ui";
export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const { household } = await getContext();
  const data = await homeData(household.id);
  const params = await searchParams;
  const list = data.lists.find((l) => l.id === params.list) || data.lists[0];
  const items = data.items
    .filter((i) => i.listId === list?.id)
    .sort((a, b) => Number(a.checked) - Number(b.checked));
  return (
    <>
      <SharedRefresh />
      <PageHeader
        title="Courses"
        description="Des listes partagées avec ton foyer, toujours à portée de main."
      />
      <Editor title="Créer une liste" open={!data.lists.length}>
        <EntityForm entity="shoppingList" label="Créer la liste">
          <Field
            label="Nom de la liste"
            name="name"
            required
            maxLength={120}
            placeholder="Supermarché, bricolage…"
          />
        </EntityForm>
      </Editor>
      <nav aria-label="Listes de courses" className="mb-6 flex flex-wrap gap-2">
        {data.lists.map((l) => (
          <Link
            key={l.id}
            href={`/shopping?list=${l.id}`}
            aria-current={l.id === list?.id ? "page" : undefined}
            className={`min-h-11 rounded-xl border px-4 py-3 text-sm ${l.id === list?.id ? "bg-primary/10 text-primary" : "bg-surface"}`}
          >
            {l.name}{" "}
            <span className="ml-2 text-xs">
              {data.items.filter((i) => i.listId === l.id && !i.checked).length}
            </span>
          </Link>
        ))}
      </nav>
      {!list ? (
        <Empty text="Crée une liste pour préparer tes prochaines courses." />
      ) : (
        <>
          <section className="panel mb-6">
            <div className="mb-5 flex justify-between gap-3">
              <h2 className="text-xl font-semibold">{list.name}</h2>
              <span className="text-xs text-muted-foreground">
                {items.filter((i) => i.checked).length}/{items.length} cochés
              </span>
            </div>
            <EntityForm entity="shoppingItem" label="Ajouter à la liste">
              <input name="listId" type="hidden" value={list.id} />
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Field
                  label="Article"
                  name="name"
                  required
                  maxLength={120}
                  placeholder="Lait, piles, filtre…"
                />
                <Field
                  label="Quantité"
                  name="quantity"
                  required
                  maxLength={80}
                  defaultValue="1"
                />
              </div>
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Associer à un équipement ou entretien
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Select
                    label="Équipement"
                    name="equipmentId"
                    options={data.equipments}
                  />
                  <Select
                    label="Entretien"
                    name="maintenanceId"
                    options={data.tasks.map((t) => ({
                      id: t.id,
                      name: t.title,
                    }))}
                  />
                </div>
              </details>
            </EntityForm>
          </section>
          {!items.length ? (
            <Empty text="Ta liste est vide. Ajoute le premier article." />
          ) : (
            <div className="divide-y rounded-2xl border bg-surface px-4 sm:px-6">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-3 py-3">
                  <ShoppingToggle id={i.id} name={i.name} checked={i.checked} />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`break-words text-sm ${i.checked ? "text-muted-foreground line-through" : ""}`}
                    >
                      {i.quantity} × {i.name}
                    </p>
                    {(i.equipmentId || i.maintenanceId) && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[
                          data.equipments.find((e) => e.id === i.equipmentId)
                            ?.name,
                          data.tasks.find((t) => t.id === i.maintenanceId)
                            ?.title,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                  <Action
                    entity="shoppingItem"
                    id={i.id}
                    operation="delete"
                    label="Retirer"
                  />
                </div>
              ))}
            </div>
          )}
          <Editor title="Gérer cette liste">
            <EntityForm entity="shoppingList" id={list.id}>
              <Field
                label="Nom"
                name="name"
                defaultValue={list.name}
                required
                maxLength={120}
              />
            </EntityForm>
            <div className="mt-5">
              <Action
                entity="shoppingList"
                id={list.id}
                operation="delete"
                label="Supprimer la liste et ses articles"
              />
            </div>
          </Editor>
          <p className="mt-5 text-xs text-muted-foreground">
            Partagée avec les membres du foyer. Actualisation automatique toutes
            les 10 secondes lorsque la liste est visible.
          </p>
        </>
      )}
    </>
  );
}
