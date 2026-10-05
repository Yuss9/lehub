import Link from "next/link";
import { Files, Download } from "lucide-react";
import { getContext } from "@/lib/context";
import { homeData } from "@/lib/home-data";
import { UploadForm } from "@/components/upload-form";
import {
  PageHeader,
  Editor,
  Empty,
  SearchForm,
  labels,
} from "@/components/home-ui";
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { household } = await getContext();
  const data = await homeData(household.id);
  const params = await searchParams;
  const query = (params.q || "").toLocaleLowerCase("fr");
  const documents = data.documents.filter(
    (d) =>
      [d.title, d.originalName]
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(query) &&
      (!params.category || d.category === params.category),
  );
  return (
    <>
      <PageHeader
        title="Documents"
        description="Factures, tickets, notices : tes essentiels dans un espace privé."
      />
      <SearchForm query={params.q} action="/documents" />
      <form className="mb-6 flex items-center gap-3">
        <label className="text-sm">
          Type{" "}
          <select
            name="category"
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
      <Editor title="Déposer un document" open={!data.documents.length}>
        <UploadForm equipments={data.equipments} />
      </Editor>
      {!documents.length ? (
        <Empty text="Aucun document. Dépose une facture, une notice ou une photo." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {documents.map((d) => (
            <article key={d.id} id={d.id} className="panel card-enter">
              <div className="mb-5 flex items-center gap-3">
                <span className="rounded-xl bg-muted p-3">
                  <Files size={20} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {labels[d.category]} · {(d.size / 1024).toFixed(0)} Ko
                </span>
              </div>
              <h2 className="break-words font-semibold">{d.title}</h2>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                {d.originalName}
              </p>
              {d.equipmentId && (
                <p className="mt-3 text-sm">
                  {data.equipments.find((e) => e.id === d.equipmentId)?.name}
                </p>
              )}
              <Link
                href={`/api/documents/${d.id}`}
                className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-primary"
              >
                <Download size={16} />
                Télécharger
              </Link>
            </article>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs leading-6 text-muted-foreground">
        Les originaux sont conservés sur ton serveur et accessibles uniquement
        aux membres de ton foyer.
      </p>
    </>
  );
}
