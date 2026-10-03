import { Brand } from "./brand";
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-svh lg:grid-cols-[1fr_1fr]">
      <aside className="hidden flex-col justify-between border-r border-border bg-surface p-16 lg:flex">
        <Brand />
        <div>
          <span className="eyebrow">UN PEU PLUS SIMPLE, CHAQUE JOUR</span>
          <p className="mt-5 max-w-lg text-6xl font-medium leading-[1.08] tracking-[-0.05em]">
            Une place pour
            <br />
            toute la maison.
          </p>
          <p className="mt-7 max-w-sm text-lg leading-relaxed text-muted-foreground">
            Ton foyer, tes habitudes, tes informations. Réunis chez toi.
          </p>
          <div className="mt-12 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-600" />
            Hébergé chez toi. Pensé pour ton quotidien.
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          lehub · Un foyer bien organisé, l’esprit plus léger.
        </p>
      </aside>
      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <div className="mb-12 lg:hidden">
            <Brand />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-8 mt-3 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          {children}
        </div>
      </section>
    </main>
  );
}
