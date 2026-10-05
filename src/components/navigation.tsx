"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Settings2,
  DoorOpen,
  Wrench,
  ShoppingBasket,
  Files,
  Search,
  Package,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
const links = [
  { href: "/", name: "Aperçu", Icon: LayoutGrid },
  { href: "/rooms", name: "Pièces", Icon: DoorOpen },
  { href: "/equipment", name: "Équipements", Icon: Package },
  { href: "/maintenance", name: "Entretien", Icon: Wrench },
  { href: "/shopping", name: "Courses", Icon: ShoppingBasket },
  { href: "/documents", name: "Documents", Icon: Files },
  { href: "/search", name: "Recherche", Icon: Search },
  { href: "/settings", name: "Paramètres", Icon: Settings2 },
];
export function Navigation() {
  const path = usePathname();
  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="hidden gap-2 md:flex md:flex-col"
      >
        {links.map(({ href, name, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-4 text-sm transition-colors",
              path === href
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon size={18} />
            {name}
          </Link>
        ))}
      </nav>
      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t bg-surface px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
      >
        {[links[0], links[3], links[4], links[5]].map(
          ({ href, name, Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              className={cn(
                "flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px]",
                path === href
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground",
              )}
            >
              <Icon size={20} />
              {name}
            </Link>
          ),
        )}
        <details className="group">
          <summary className="flex min-h-12 min-w-14 cursor-pointer list-none flex-col items-center justify-center gap-1 rounded-xl text-[10px]">
            <Menu size={20} />
            Plus
          </summary>
          <div className="absolute right-3 bottom-full mb-3 w-56 rounded-2xl border bg-surface p-3 shadow-lg">
            {[links[1], links[2], links[6], links[7]].map(
              ({ href, name, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex min-h-12 items-center gap-3 rounded-xl p-3 text-sm hover:bg-muted"
                  onClick={(e) =>
                    e.currentTarget.closest("details")?.removeAttribute("open")
                  }
                >
                  <Icon size={18} />
                  {name}
                </Link>
              ),
            )}
          </div>
        </details>
      </nav>
    </>
  );
}
