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
} from "lucide-react";
import { cn } from "@/lib/utils";
export function Navigation() {
  const path = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="flex gap-2 overflow-x-auto md:flex-col"
    >
      {[
        { href: "/", name: "Aperçu", Icon: LayoutGrid },
        { href: "/rooms", name: "Pièces", Icon: DoorOpen },
        { href: "/equipment", name: "Équipements", Icon: Package },
        { href: "/maintenance", name: "Entretien", Icon: Wrench },
        { href: "/shopping", name: "Courses", Icon: ShoppingBasket },
        { href: "/documents", name: "Documents", Icon: Files },
        { href: "/search", name: "Recherche", Icon: Search },
        { href: "/settings", name: "Paramètres", Icon: Settings2 },
      ].map(({ href, name, Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={path === href ? "page" : undefined}
          className={cn(
            "flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-4 text-sm transition-colors",
            path === href
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          <Icon size={18} strokeWidth={1.8} />
          {name}
        </Link>
      ))}
    </nav>
  );
}
