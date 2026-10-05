import Link from "next/link";
import { getContext } from "@/lib/context";
import { homeData } from "@/lib/home-data";
import { PageHeader, SearchForm, Empty } from "@/components/home-ui";
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { household } = await getContext();
  const data = await homeData(household.id);
  const { q = "" } = await searchParams;
  const query = q.trim().slice(0, 120).toLocaleLowerCase("fr");
  const match = (...values: (string | null)[]) =>
    query && values.join(" ").toLocaleLowerCase("fr").includes(query);
  const groups = [
    {
      title: "Pièces",
      results: data.rooms
        .filter((r) => match(r.name, r.description))
        .map((r) => ({
          id: r.id,
          title: r.name,
          detail: r.archived ? "Archivée" : "Pièce",
          href: `/rooms#${r.id}`,
        })),
    },
    {
      title: "Équipements",
      results: data.equipments
        .filter((e) => match(e.name, e.brand, e.model, e.serial, e.notes))
        .map((e) => ({
          id: e.id,
          title: e.name,
          detail: [e.brand, e.model].join(" "),
          href: `/equipment?archived=1#${e.id}`,
        })),
    },
    {
      title: "Entretiens",
      results: data.tasks
        .filter((t) => match(t.title, t.notes))
        .map((t) => ({
          id: t.id,
          title: t.title,
          detail: t.dueOn,
          href: `/maintenance?archived=1#${t.id}`,
        })),
    },
    {
      title: "Courses",
      results: data.items
        .filter((i) => match(i.name))
        .map((i) => ({
          id: i.id,
          title: i.name,
          detail: data.lists.find((l) => l.id === i.listId)?.name || "",
          href: `/shopping?list=${i.listId}`,
        })),
    },
    {
      title: "Documents",
      results: data.documents
        .filter((d) => match(d.title, d.originalName))
        .map((d) => ({
          id: d.id,
          title: d.title,
          detail: d.originalName,
          href: `/documents#${d.id}`,
        })),
    },
  ];
  groups.push({
    title: "Listes de courses",
    results: data.lists
      .filter((l) => match(l.name))
      .map((l) => ({
        id: l.id,
        title: l.name,
        detail: "Liste partagée",
        href: `/shopping?list=${l.id}`,
      })),
  });
  groups.push({
    title: "Interventions",
    results: data.history
      .filter((h) =>
        match(
          h.notes,
          data.tasks.find((t) => t.id === h.maintenanceId)?.title || "",
        ),
      )
      .map((h) => ({
        id: h.id,
        title:
          data.tasks.find((t) => t.id === h.maintenanceId)?.title ||
          "Intervention",
        detail: `${h.completedOn} · ${h.notes}`,
        href: "/maintenance",
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
            {total} résultat(s) pour « {q.slice(0, 120)} »
          </p>
          {!total && <Empty text="Aucun résultat. Essaie un autre mot-clé." />}
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
