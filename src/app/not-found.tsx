import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24">
      <h1 className="text-3xl font-semibold">Cette pièce est introuvable.</h1>
      <p className="my-5 text-muted-foreground">
        Cette page n’existe pas ou a été déplacée.
      </p>
      <Link href="/" className="text-primary underline">
        Retour à l’accueil
      </Link>
    </main>
  );
}
