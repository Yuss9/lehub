import Link from "next/link";
import { eq, count } from "drizzle-orm";
import {
  ArrowUpRight,
  Check,
  House,
  Users,
  ShieldCheck,
  SlidersHorizontal,
  DoorOpen,
  Wrench,
  ShoppingBasket,
  Files,
} from "lucide-react";
import { db } from "@/db";
import { membership } from "@/db/schema";
import { getContext } from "@/lib/context";
import { Button } from "@/components/ui/button";
export default async function HomePage() {
  const context = await getContext();
  const [members] = await db
    .select({ count: count() })
    .from(membership)
    .where(eq(membership.householdId, context.household.id));
  const date = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeZone: context.household.timezone,
  }).format(new Date());
  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">TON ESPACE MAISON</p>
          <h1 className="page-title mt-3">Aperçu</h1>
        </div>
        <span className="hidden pt-1 text-xs capitalize text-muted-foreground sm:block">
          {date}
        </span>
      </header>
      <section className="relative mt-10 overflow-hidden rounded-3xl border border-border bg-surface px-7 py-9 sm:px-10 sm:py-12">
        <div className="relative z-10 max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-600" />
            Ton foyer est prêt
          </span>
          <h2 className="mt-6 text-3xl font-medium leading-tight tracking-[-0.04em] sm:text-[42px]">
            Bienvenue chez toi,
            <br />
            {context.user.name.split(" ")[0]}.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-7 text-muted-foreground">
            Un espace à toi pour prendre soin de ce qui compte. Commence par
            personnaliser ton foyer
            {context.membership.role === "admin"
              ? " et inviter ceux qui le partagent."
              : "."}
          </p>
          <Button asChild variant="outline" className="mt-7">
            <Link href="/settings">
              {context.membership.role === "admin"
                ? "Personnaliser mon foyer"
                : "Mes paramètres"}
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
      <section className="mt-10">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            L’essentiel du foyer
          </h2>
          <span className="text-xs text-muted-foreground">
            {context.household.name}
          </span>
        </div>
        <div className="divide-y divide-border rounded-2xl border border-border bg-surface px-6">
          {[
            {
              Icon: Users,
              title: "Un foyer à partager",
              text: `${members.count} ${members.count > 1 ? "membres réunis" : "membre"} dans cet espace`,
              badge:
                context.membership.role === "admin"
                  ? "Administrateur"
                  : "Membre",
            },
            {
              Icon: SlidersHorizontal,
              title: "À ton rythme",
              text: `${context.household.timezone} · ${context.household.currency}`,
              badge: "Personnalisable",
            },
            {
              Icon: ShieldCheck,
              title: "Un espace privé",
              text: "L’accès au foyer est réservé à ses membres.",
              badge: "Sur invitation",
            },
          ].map(({ Icon, title, text, badge }) => (
            <div key={title} className="flex items-center gap-4 py-5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Icon size={21} strokeWidth={1.6} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium">{title}</h3>
                <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                  {text}
                </p>
              </div>
              <span className="hidden text-xs text-muted-foreground sm:block">
                {badge}
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-11 border-t border-border pt-7">
        <div className="flex items-center gap-2">
          <Check size={15} className="text-primary" />
          <h2 className="text-sm font-medium">
            Les premières fondations sont en place.
          </h2>
        </div>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          Les espaces suivants seront ajoutés dans les prochains lots de
          développement.
        </p>
        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-xs text-muted-foreground">
          {[
            { Icon: DoorOpen, text: "Pièces & équipements" },
            { Icon: Wrench, text: "Entretien" },
            { Icon: ShoppingBasket, text: "Courses" },
            { Icon: Files, text: "Documents" },
          ].map(({ Icon, text }) => (
            <li key={text} className="flex items-center gap-2">
              <Icon size={15} />
              {text}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
