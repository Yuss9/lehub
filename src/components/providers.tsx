"use client";
import { useSyncExternalStore } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  );
}
export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const { setTheme, theme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return (
    <div
      className="flex gap-1 rounded-xl border border-border p-1"
      role="group"
      aria-label="Apparence"
    >
      {[
        { value: "light", label: "Clair", Icon: Sun },
        { value: "dark", label: "Sombre", Icon: Moon },
        { value: "system", label: "Système", Icon: Monitor },
      ].map(({ value, label, Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          type="button"
          title={label}
          aria-pressed={mounted && theme === value}
          className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-xs hover:bg-muted aria-pressed:bg-muted aria-pressed:text-primary focus-visible:outline-2 focus-visible:outline-primary"
          aria-label={`Thème ${label.toLowerCase()}`}
        >
          <Icon size={15} />
          <span className={compact ? "sr-only" : undefined}>{label}</span>
        </button>
      ))}
    </div>
  );
}
