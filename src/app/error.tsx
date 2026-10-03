"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg p-8 py-24">
      <h1 className="text-2xl font-semibold">Une petite interruption.</h1>
      <p className="my-5 text-sm leading-7 text-muted-foreground">
        Impossible de charger cet espace. Vérifie que le serveur et sa base de
        données sont disponibles, puis réessaie.
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </main>
  );
}
