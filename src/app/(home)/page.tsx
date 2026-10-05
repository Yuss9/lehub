import Link from "next/link";
import {
  House,
  DoorOpen,
  Wrench,
  ShoppingBasket,
  Files,
  ArrowUpRight,
} from "lucide-react";
import { getContext } from "@/lib/context";
import { dashboardData } from "@/lib/home-data";
import { today } from "@/lib/recurrence";
import { SearchForm, Empty, Jump, dateLabel } from "@/components/home-ui";
import { Button } from "@/components/ui/button";
export default async function HomePage() {
  const { household, user } = await getContext();
  const data = await dashboardData(household.id, household.timezone);
  const current = today(household.timezone);
  const tasks = data.upcoming;
  const warranties = data.warranties;
  return (
    <>
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">TON ESPACE MAISON</p>
          <h1 className="page-title mt-3">Aperçu</h1>
        </div>
        <span className="hidden pt-1 text-xs capitalize text-muted-foreground sm:block">
          {new Intl.DateTimeFormat("fr-FR", {
            dateStyle: "full",
            timeZone: household.timezone,
          }).format(new Date())}
        </span>
      </header>
      <SearchForm />
      <section className="relative mb-8 overflow-hidden rounded-3xl border bg-surface px-7 py-9 sm:px-10 sm:py-12">
        <div className="relative z-10 max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-600" />
            {household.name}
          </span>
          <h2 className="mt-6 text-3xl font-medium leading-tight tracking-[-0.04em] sm:text-[42px]">
            Bienvenue chez toi,
            <br />
            {user.name.split(" ")[0]}.
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">
            {data.overdue
              ? `${data.overdue} entretien(s) à réaliser aujourd’hui ou en retard.`
              : "Tout est en ordre. Un peu d’attention aujourd’hui, une maison qui dure."}
          </p>
          <Button asChild variant="outline" className="mt-7">
            <Link href={data.rooms ? "/maintenance" : "/rooms"}>
              {data.rooms ? "Voir les entretiens" : "Organiser ma maison"}
              <ArrowUpRight />
            </Link>
          </Button>
        </div>
        <House
          aria-hidden="true"
          className="pointer-events-none absolute -right-8 bottom-8 hidden size-64 text-primary/10 lg:block"
          strokeWidth={0.65}
        />
      </section>
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            Icon: DoorOpen,
            label: "Pièces",
            value: data.rooms,
            href: "/rooms",
          },
          {
            Icon: Wrench,
            label: "Entretiens à venir",
            value: data.tasks,
            href: "/maintenance",
          },
          {
            Icon: ShoppingBasket,
            label: "Articles à acheter",
            value: data.items,
            href: "/shopping",
          },
          {
            Icon: Files,
            label: "Documents privés",
            value: data.documents,
            href: "/documents",
          },
        ].map(({ Icon, label, value, href }) => (
          <Link
            key={href}
            href={href}
            className="panel stat-card p-5! transition-colors hover:border-primary/40"
          >
            <Icon size={20} className="text-muted-foreground" />
            <p className="mt-5 text-3xl font-semibold tracking-tight">
              {value}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{label}</p>
          </Link>
        ))}
      </section>
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Prochains entretiens</h2>
            <Jump href="/maintenance">Tout voir</Jump>
          </div>
          {!tasks.length ? (
            <Empty text="Planifie ton premier entretien pour ne plus oublier les essentiels." />
          ) : (
            <div className="divide-y rounded-2xl border bg-surface px-6">
              {tasks.slice(0, 5).map((t) => (
                <Link
                  key={t.id}
                  href={`/maintenance#${t.id}`}
                  className="flex min-h-20 items-center justify-between gap-3 py-4"
                >
                  <span className="text-sm">{t.title}</span>
                  <span
                    className={`shrink-0 text-xs ${t.dueOn < current ? "text-danger" : "text-muted-foreground"}`}
                  >
                    {dateLabel(t.dueOn)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Garanties à surveiller</h2>
            <Jump href="/equipment">Équipements</Jump>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Garanties arrivant à échéance dans les 90 jours.
          </p>
          {!warranties.length ? (
            <Empty text="Aucune garantie n’expire dans les 90 prochains jours." />
          ) : (
            <div className="divide-y rounded-2xl border bg-surface px-6">
              {warranties.map((e) => (
                <Link
                  key={e.id}
                  href={`/equipment#${e.id}`}
                  className="flex min-h-20 items-center justify-between gap-3 py-4"
                >
                  <span className="text-sm">{e.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {dateLabel(e.warrantyUntil)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <span className="text-xs text-muted-foreground">
          {data.equipments} équipements · {household.name}
        </span>
        <Jump href="/api/export">Télécharger la sauvegarde ZIP</Jump>
      </footer>
    </>
  );
}
