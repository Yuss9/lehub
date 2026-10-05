import Link from "next/link";
import { Plus, ArrowUpRight, Search } from "lucide-react";
import { homeAction } from "@/app/home-actions";
import { MutationForm } from "./form";
export const labels: Record<string, string> = {
  invoice: "Facture",
  receipt: "Ticket",
  manual: "Notice",
  photo: "Photo",
  other: "Autre",
  once: "Une fois",
  weekly: "Chaque semaine",
  monthly: "Chaque mois",
  yearly: "Chaque année",
};
export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="mb-9">
      <p className="eyebrow">LE FOYER, SIMPLEMENT</p>
      <h1 className="page-title mt-3">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </header>
  );
}
export function Select({
  label,
  name,
  value = "",
  options,
  required = false,
}: {
  label: string;
  name: string;
  value?: string | null;
  options: { id: string; name: string }[];
  required?: boolean;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      <span>{label}</span>
      <select
        aria-label={label}
        name={name}
        defaultValue={value || ""}
        required={required}
        className="min-h-11 w-full rounded-xl border bg-surface px-3 text-sm"
      >
        <option value="">{required ? "Choisir…" : "Aucun"}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Editor({
  title,
  children,
  open = false,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open || undefined} className="panel group mb-5">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-medium">
        {title}
        <Plus size={18} className="transition-transform group-open:rotate-45" />
      </summary>
      <div className="mt-5 border-t pt-5">{children}</div>
    </details>
  );
}
export function EntityForm({
  entity,
  id = "",
  label = "Enregistrer",
  children,
  revision = 0,
}: {
  revision?: number;
  entity: string;
  id?: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <MutationForm action={homeAction} label={label}>
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      {children}
    </MutationForm>
  );
}
export function Action({
  entity,
  id,
  operation,
  label,
  children,
  revision = 0,
}: {
  revision?: number;
  entity: string;
  id: string;
  operation: string;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <MutationForm
      action={homeAction}
      label={label}
      compact
      confirmation={
        operation === "delete" ? "Supprimer cet élément ?" : undefined
      }
    >
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="operation" value={operation} />
      {children}
    </MutationForm>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed p-8 text-center text-sm leading-6 text-muted-foreground">
      {text}
    </p>
  );
}
export function Jump({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary"
    >
      {children}
      <ArrowUpRight size={16} />
    </Link>
  );
}
export function SearchForm({
  query = "",
  action = "/search",
}: {
  query?: string;
  action?: string;
}) {
  return (
    <form
      action={action}
      role="search"
      className="mb-6 flex items-center gap-3 rounded-2xl border bg-surface px-4"
    >
      <Search size={18} className="shrink-0 text-muted-foreground" />
      <input
        name="q"
        defaultValue={query}
        aria-label="Rechercher dans le foyer"
        placeholder="Rechercher dans le foyer…"
        maxLength={120}
        className="min-h-12 w-full min-w-0 bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      <button className="min-h-11 text-sm text-primary">Chercher</button>
    </form>
  );
}
export function dateLabel(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(`${value}T00:00:00Z`))
    : "Non renseignée";
}

export function Pagination({
  page,
  pages,
  path,
  params = {},
}: {
  page: number;
  pages: number;
  path: string;
  params?: Record<string, string | undefined>;
}) {
  if (pages <= 1) return null;
  const url = (p: number) => {
    const q = new URLSearchParams();
    for (const [key, v] of Object.entries(params)) if (v) q.set(key, v);
    q.set("page", String(p));
    return `${path}?${q}`;
  };
  return (
    <nav
      aria-label="Pagination"
      className="my-6 flex items-center justify-between gap-4 text-sm"
    >
      {page > 1 ? (
        <Link className="min-h-11 py-3 text-primary" href={url(page - 1)}>
          ← Précédent
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page {page} sur {pages}
      </span>
      {page < pages ? (
        <Link className="min-h-11 py-3 text-primary" href={url(page + 1)}>
          Suivant →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
