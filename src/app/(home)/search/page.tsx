import Link from "next/link";
import { getContext } from "@/lib/context";
import { homeData } from "@/lib/home-data";
import { PageHeader, SearchForm, Empty } from "@/components/home-ui";
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { household } = await getContext();
  const { q = "", page = "1" } = await searchParams;
  const pageIndex = Math.max(1, Math.min(10000, Number(page) || 1));
  const data = await homeData(household.id, {
    query: q,
    page: pageIndex,
    modules: q.trim() ? undefined : [],
  });
  const query = q.trim().slice(0, 120).toLocaleLowerCase("fr");
  const groups = [
    {
      title: "Pièces",
      results: data.rooms.map((r) => ({
        id: r.id,
        title: r.name,
        detail: r.archived ? "Archivée" : "Pièce",
        href: `/rooms?q=${encodeURIComponent(r.name)}#${r.id}`,
      })),
    },
    {
      title: "Équipements",
      results: data.equipments.map((e) => ({
        id: e.id,
        title: e.name,
        detail: [e.brand, e.model].join(" "),
        href: `/equipment/${e.id}`,
      })),
    },
    {
      title: "Entretiens",
      results: data.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        detail: t.dueOn,
        href: `/maintenance?task=${t.id}`,
      })),
    },
    {
      title: "Courses",
      results: data.items.map((i) => ({
        id: i.id,
        title: i.name,
        detail: data.lists.find((l) => l.id === i.listId)?.name || "",
        href: `/shopping?list=${i.listId}`,
      })),
    },
    {
      title: "Documents",
      results: data.documents.map((d) => ({
        id: d.id,
        title: d.title,
        detail: d.originalName,
        href: `/documents?q=${encodeURIComponent(d.title)}#${d.id}`,
      })),
    },
  ];
  groups.push({
    title: "Listes de courses",
    results: data.lists.map((l) => ({
      id: l.id,
      title: l.name,
      detail: "Liste partagée",
      href: `/shopping?list=${l.id}`,
    })),
  });
  groups.push({
    title: "Interventions",
    results: data.history.map((h) => ({
      id: h.id,
      title:
        data.tasks.find((t) => t.id === h.maintenanceId)?.title ||
        "Intervention",
      detail: `${h.completedOn} · ${h.notes}`,
      href: "/maintenance?view=history",
    })),
  });
  const total = groups.reduce((n, g) => n + g.results.length, 0);
  return (
    <>
      <PageHeader
        title="Recherche"
        description="Retrouve les essentiels dans tout ton foyer."
      />
      <SearchForm query={q} />
      {!query ? (
        <Empty text="Saisis un nom, une marque, un modèle ou un numéro de série." />
      ) : (
        <>
          <p className="mb-6 text-sm text-muted-foreground">
            Page {pageIndex} · jusqu’à 20 résultats par rubrique pour «{" "}
            {q.slice(0, 120)} »
          </p>
          {!total && <Empty text="Aucun résultat. Essaie un autre mot-clé." />}
          <div className="mb-6 flex gap-4 text-sm text-primary">
            {pageIndex > 1 && (
              <Link
                href={`/search?q=${encodeURIComponent(q)}&page=${pageIndex - 1}`}
              >
                Précédent
              </Link>
            )}
            {groups.some((g) => g.results.length === 20) && (
              <Link
                href={`/search?q=${encodeURIComponent(q)}&page=${pageIndex + 1}`}
              >
                Suivant
              </Link>
            )}
          </div>
          {groups
            .filter((g) => g.results.length)
            .map((g) => (
              <section key={g.title} className="mb-8">
                <h2 className="mb-4 font-semibold">{g.title}</h2>
                <div className="divide-y rounded-2xl border bg-surface px-6">
                  {g.results.map((r) => (
                    <Link
                      key={r.id}
                      href={r.href}
                      className="block min-h-20 py-5"
                    >
                      <p className="text-sm font-medium">{r.title}</p>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {r.detail}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
        </>
      )}
    </>
  );
}
