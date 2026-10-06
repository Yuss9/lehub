import Link from "next/link";
import { ShoppingBoard } from "@/components/shopping-board";
export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-3xl p-5">
      <h1 className="page-title mb-4">Courses hors ligne</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Les courses conservées sur cet appareil. Les changements seront
        synchronisés après vérification de ton accès.
      </p>
      <ShoppingBoard />
      <Link href="/shopping" prefetch={false} className="mt-6 inline-block text-sm text-primary">
        Revenir au foyer
      </Link>
    </main>
  );
}
