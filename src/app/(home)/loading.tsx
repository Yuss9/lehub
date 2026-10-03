export default function Loading() {
  return (
    <div role="status" aria-label="Chargement" className="space-y-8">
      <p className="text-sm text-muted-foreground">Ton espace se prépare…</p>
      <div className="h-10 w-48 rounded-xl bg-muted" />
      <div className="h-72 rounded-3xl bg-muted" />
    </div>
  );
}
