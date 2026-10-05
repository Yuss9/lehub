import { getContext } from "@/lib/context";
import { homeData, pageNumber } from "@/lib/home-data";
import { UploadForm } from "@/components/upload-form";
import { DocumentCard } from "@/components/document-card";
import {
  PageHeader,
  Editor,
  Empty,
  SearchForm,
  labels,
  Pagination,
  Action,
} from "@/components/home-ui";
import { db } from "@/db";
import { document } from "@/db/schema";
import { and, eq, isNotNull, desc } from "drizzle-orm";
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  const { household } = await getContext();
  const params = await searchParams;
  const data = await homeData(household.id, {
    modules: ["documents", "equipments"],
    primary: "documents",
    page: pageNumber(params.page),
    query: params.q,
    category: params.category,
  });
  const trash = await db
    .select()
    .from(document)
    .where(
      and(
        eq(document.householdId, household.id),
        isNotNull(document.deletedAt),
      ),
    )
    .orderBy(desc(document.deletedAt))
    .limit(20);
  return (
    <>
      <PageHeader
        title="Documents"
        description="Factures, tickets, notices et photos, dans un espace privé."
      />
      <SearchForm query={params.q} action="/documents" />
      <form className="mb-6 flex flex-wrap items-center gap-3">
        <input name="q" type="hidden" value={params.q || ""} />
        <label className="text-sm">
          Type{" "}
          <select
            name="category"
            aria-label="Filtrer par type"
            defaultValue={params.category || ""}
            className="min-h-11 rounded-xl border bg-surface px-3"
          >
            <option value="">Tous</option>
            {["invoice", "receipt", "manual", "photo", "other"].map((id) => (
              <option key={id} value={id}>
                {labels[id]}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-11 text-sm text-primary">Filtrer</button>
      </form>
      <Editor title="Déposer un document" open={!data.total}>
        <UploadForm equipments={data.equipments} />
      </Editor>
      {!data.documents.length ? (
        <Empty text="Aucun document pour cette sélection." />
      ) : (
        <div className="space-y-5">
          {data.documents.map((file) => (
            <DocumentCard
              key={file.id}
              file={file}
              equipments={data.equipments}
            />
          ))}
        </div>
      )}
      <Pagination
        path="/documents"
        params={params}
        page={data.page}
        pages={data.pages}
      />
      {trash.length > 0 && (
        <Editor title="Corbeille des documents">
          <p className="mb-4 text-xs text-muted-foreground">
            Restauration possible pendant 30 jours. Les fichiers sont ensuite
            supprimés par le worker.
          </p>
          {trash.map((file) => (
            <div
              key={file.id}
              className="flex items-center justify-between gap-3 border-t py-4"
            >
              <p className="text-sm">{file.title}</p>
              <Action
                entity="document"
                id={file.id}
                revision={file.revision}
                operation="undo"
                label="Restaurer le document"
              />
            </div>
          ))}
        </Editor>
      )}
      <p className="mt-6 text-xs text-muted-foreground">
        La recherche couvre les titres, tags et textes reconnus. Accès réservé
        aux membres du foyer.
      </p>
    </>
  );
}
