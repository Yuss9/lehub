import { getContext } from "@/lib/context";
import { Brand } from "@/components/brand";
import { Navigation } from "@/components/navigation";
import { SignOut } from "@/components/account-controls";
import { ThemeControl } from "@/components/providers";
export const dynamic = "force-dynamic";
export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getContext();
  return (
    <div className="min-h-svh md:pl-64">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-surface focus:p-4"
      >
        Aller au contenu
      </a>
      <aside className="border-b border-border bg-surface px-5 py-5 md:fixed md:inset-y-0 md:left-0 md:flex md:w-64 md:flex-col md:border-r md:border-b-0 md:px-5 md:py-9">
        <div className="flex items-center justify-between md:px-3">
          <Brand />
          <div className="md:hidden">
            <SignOut />
          </div>
        </div>
        <p className="my-7 hidden truncate px-4 text-xs text-muted-foreground md:block">
          {context.household.name}
        </p>
        <div className="mt-5 md:mt-0">
          <Navigation />
        </div>
        <div className="mt-auto hidden space-y-5 pt-8 md:block">
          <ThemeControl compact />
          <div className="border-t border-border pt-5">
            <div className="flex items-center gap-3 px-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {context.user.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {context.user.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {context.membership.role === "admin"
                    ? "Administrateur"
                    : "Membre"}
                </p>
              </div>
            </div>
            <div className="mt-3 px-1">
              <SignOut />
            </div>
          </div>
        </div>
      </aside>
      <main
        id="main"
        className="mx-auto max-w-6xl px-6 py-9 sm:px-10 lg:px-14 lg:py-12"
      >
        {children}
      </main>
    </div>
  );
}
