"use client";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Field } from "./form";
import { Button } from "./ui/button";
import { clearShopping } from "@/lib/offline-shopping";
export function BackupControls({ admin }: { admin: boolean }) {
  const [preview, setPreview] = useState<{
    name: string;
    rooms: number;
    equipments: number;
    tasks: number;
    documents: number;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const file = useRef<File | null>(null);
  const router = useRouter();
  async function send(confirmRestore = false) {
    if (!file.current) return;
    setPending(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file.current);
      if (confirmRestore) form.set("confirmation", "RESTAURER");
      const response = await fetch("/api/backup", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (data.preview) setPreview(data.preview);
      else {
        await clearShopping();
        setPreview(null);
        setMessage("Le foyer a été restauré.");
        router.refresh();
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Restauration impossible.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <a
        className="inline-flex min-h-11 items-center rounded-xl border px-5 text-sm"
        href="/api/backup"
      >
        Télécharger la sauvegarde ZIP
      </a>
      <p className="text-xs text-muted-foreground">
        Toutes les données du foyer et les fichiers originaux, y compris la
        corbeille. Conserve cette archive dans un endroit privé.
      </p>
      {admin && (
        <>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Field
              label="Archive ZIP à restaurer"
              name="file"
              type="file"
              accept=".zip,application/zip"
              required
              onChange={(e) => {
                file.current = e.target.files?.[0] || null;
                setPreview(null);
              }}
            />
            <Button disabled={pending}>Vérifier l’archive</Button>
          </form>
          {preview && (
            <form
              className="space-y-4 rounded-xl border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  new FormData(e.currentTarget).get("confirmation") ===
                  "RESTAURER"
                )
                  void send(true);
              }}
            >
              <p className="text-sm">
                « {preview.name} » · {preview.rooms} pièces ·{" "}
                {preview.equipments} équipements · {preview.tasks} entretiens ·{" "}
                {preview.documents} fichiers
              </p>
              <p className="text-sm">
                Cette restauration remplace les données du foyer actuel. Les
                comptes, les accès et les préférences de rappel sont conservés.
                Télécharge une sauvegarde avant de continuer.
              </p>
              <Field
                label="Écris RESTAURER pour confirmer"
                name="confirmation"
                required
                pattern="RESTAURER"
                autoComplete="off"
              />
              <Button variant="danger" disabled={pending}>
                Remplacer les données du foyer
              </Button>
            </form>
          )}
        </>
      )}
      <p role="status" className="text-sm">
        {message}
      </p>
    </div>
  );
}
