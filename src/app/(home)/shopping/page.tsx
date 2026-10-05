import { getContext } from "@/lib/context";
import { shoppingState } from "@/lib/shopping-state";
import { db } from "@/db";
import { shoppingList } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { PageHeader, Editor, EntityForm, Action } from "@/components/home-ui";
import { Field } from "@/components/form";
import { ShoppingBoard } from "@/components/shopping-board";
export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  const { household, user } = await getContext();
  const data = await shoppingState(household, user);
  const params = await searchParams;
  const trash = await db
    .select()
    .from(shoppingList)
    .where(
      and(
        eq(shoppingList.householdId, household.id),
        isNotNull(shoppingList.deletedAt),
      ),
    )
    .limit(20);
  return (
    <>
      <PageHeader
        title="Courses"
        description="Tes listes partagées, même quand la connexion te quitte."
      />
      <Editor title="Créer une liste" open={!data.lists.length}>
        <EntityForm entity="shoppingList" label="Créer la liste">
          <Field label="Nom de la liste" name="name" required maxLength={120} />
        </EntityForm>
      </Editor>
      <ShoppingBoard
        key={data.lists.map((l) => `${l.id}:${l.revision}`).join(",")}
        initial={data}
        selectedList={params.list}
      />
      <Editor title="Gérer les listes · connexion requise">
        {data.lists.map((l) => (
          <section key={l.id} className="mb-5">
            <EntityForm entity="shoppingList" id={l.id} revision={l.revision}>
              <Field
                label="Nom"
                name="name"
                defaultValue={l.name}
                required
                maxLength={120}
              />
            </EntityForm>
            <Action
              entity="shoppingList"
              id={l.id}
              revision={l.revision}
              operation="delete"
              label={`Supprimer ${l.name}`}
            />
          </section>
        ))}
      </Editor>
      {trash.length > 0 && (
        <Editor title="Listes supprimées">
          {trash.map((l) => (
            <div key={l.id} className="flex justify-between gap-4">
              <span>{l.name}</span>
              <Action
                entity="shoppingList"
                id={l.id}
                revision={l.revision}
                operation="undo"
                label="Rétablir la liste"
              />
            </div>
          ))}
        </Editor>
      )}
    </>
  );
}
