"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Field } from "./form";
import {
  clearShopping,
  projectShopping,
  readShopping,
  writeShopping,
  type LocalShopping,
  type PendingShopping,
  type ShoppingState,
} from "@/lib/offline-shopping";
export function ShoppingBoard({
  initial,
  selectedList,
}: {
  initial?: ShoppingState;
  selectedList?: string;
}) {
  const [local, setLocal] = useState<LocalShopping | null>(
    initial
      ? { state: initial, queue: [], savedAt: new Date().toISOString() }
      : null,
  );
  const [enabled, setEnabled] = useState(false);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState("");
  const [listId, setListId] = useState(
    selectedList || initial?.lists[0]?.id || "",
  );
  const [edit, setEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef(local);
  const opted = useRef(false);
  const syncing = useRef(false);
  function persist(next: LocalShopping) {
    current.current = next;
    setLocal(next);
    if (opted.current) {
      try {
        writeShopping(next);
      } catch {
        setMessage(
          "Mémoire de cet appareil pleine. Garde cette page ouverte pour synchroniser.",
        );
      }
    }
  }
  async function synchronize() {
    if (syncing.current || !navigator.onLine) return;
    syncing.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/shopping", { cache: "no-store" });
      if (response.status === 401 || response.redirected) {
        clearShopping();
        current.current = null;
        setLocal(null);
        setMessage("Reconnecte-toi pour accéder aux courses.");
        return;
      }
      if (!response.ok) throw Error("Actualisation impossible.");
      const server: ShoppingState = await response.json();
      if (current.current && current.current.state.scope !== server.scope) {
        clearShopping();
        opted.current = false;
        setEnabled(false);
        persist({
          state: server,
          queue: [],
          savedAt: new Date().toISOString(),
        });
        return;
      }
      const queue = current.current?.queue || [];
      for (const mutation of [...queue]) {
        const sent = await fetch("/api/shopping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: server.scope, mutation }),
        });
        if (sent.status === 401) {
          clearShopping();
          current.current = null;
          setLocal(null);
          return;
        }
        if (!sent.ok) {
          const error = await sent.json();
          persist({ ...current.current!, state: server });
          setMessage(
            error.error ||
              "Modification en conflit. Annule les modifications en attente puis réessaie.",
          );
          return;
        }
        persist({
          ...current.current!,
          state: projectShopping(current.current!.state, [mutation]),
          queue: current.current!.queue.filter(
            (m) => m.mutationId !== mutation.mutationId,
          ),
        });
      }
      const refreshed = await fetch("/api/shopping", { cache: "no-store" });
      if (!refreshed.ok) throw Error();
      const state: ShoppingState = await refreshed.json();
      // Preserve edits queued while this request was in flight.
      persist({
        state,
        queue: current.current?.queue || [],
        savedAt: new Date().toISOString(),
      });
      setMessage("");
      if (current.current?.queue.length)
        setTimeout(() => void synchronize(), 0);
    } catch {
      setMessage("Connexion indisponible. Les changements restent en attente.");
    } finally {
      syncing.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    queueMicrotask(() => {
      const cached = readShopping();
      if (cached && (!initial || cached.state.scope === initial.scope)) {
        opted.current = true;
        setEnabled(true);
        current.current = cached;
        setLocal(cached);
        setListId(selectedList || cached.state.lists[0]?.id || "");
      } else if (cached) clearShopping();
      setOnline(navigator.onLine);
    });
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void synchronize();
    };
    const purge = () => {
      opted.current = false;
      setEnabled(false);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("lehub-offline-cleared", purge);
    queueMicrotask(() => void synchronize());
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void synchronize();
    }, 10000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("lehub-offline-cleared", purge);
    };
    // Mount once; polling reads the mutable queue ref, never a stale render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function mutate(m: Omit<PendingShopping, "mutationId">) {
    if (!current.current) return;
    if (!navigator.onLine && !opted.current) {
      setMessage("Active d’abord la conservation hors ligne sur cet appareil.");
      return;
    }
    persist({
      ...current.current,
      queue: [
        ...current.current.queue,
        { ...m, mutationId: crypto.randomUUID() },
      ],
    });
    void synchronize();
  }
  if (!local)
    return (
      <p role="status" className="panel">
        Aucune liste conservée sur cet appareil. Ouvre Courses avec une
        connexion pour les préparer.
      </p>
    );
  const data = projectShopping(local.state, local.queue);
  const list = data.lists.find((l) => l.id === listId) || data.lists[0];
  const items = data.items.filter((i) => i.listId === list?.id && !i.deletedAt);
  const deleted = data.items.filter(
    (i) => i.listId === list?.id && i.deletedAt,
  );
  const groups = [...new Set(items.map((i) => i.category || "Autres"))].sort();
  function submit(event: React.FormEvent<HTMLFormElement>, id?: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const item = items.find((i) => i.id === id);
    const values = {
      name: String(fields.get("name")),
      quantity: String(fields.get("quantity")),
      category: String(fields.get("category") || "Autres"),
      listId: list!.id,
      equipmentId: String(fields.get("equipmentId") || item?.equipmentId || ""),
      maintenanceId: String(
        fields.get("maintenanceId") || item?.maintenanceId || "",
      ),
    };
    mutate({
      kind: id ? "edit" : "add",
      id: id || crypto.randomUUID(),
      ...(item ? { revision: item.revision } : {}),
      data: values,
    });
    if (id) setEdit(null);
    else form.reset();
  }
  return (
    <div className="space-y-5">
      <div className="panel space-y-3">
        <p className="text-xs text-muted-foreground">
          {data.owner} · {data.household}
        </p>
        <p className="text-sm" role="status">
          {online ? "Connecté" : "Hors ligne"} ·{" "}
          {local.queue.length
            ? `${local.queue.length} changement(s) à synchroniser`
            : busy
              ? "Actualisation…"
              : "Courses à jour"}
        </p>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              opted.current = e.target.checked;
              setEnabled(e.target.checked);
              if (e.target.checked) writeShopping(local);
              else clearShopping();
            }}
          />{" "}
          Conserver mes courses hors ligne sur cet appareil
        </label>
        <p className="text-xs text-muted-foreground">
          Sur un appareil partagé, désactive cette option. Les données locales
          sont effacées à la déconnexion.
        </p>
        {message && (
          <p role="alert" className="text-sm text-danger">
            {message}
          </p>
        )}
        {local.queue.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={busy}
              onClick={() => void synchronize()}
            >
              Synchroniser
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (
                  confirm(
                    "Annuler tous les changements qui ne sont pas encore synchronisés ?",
                  )
                ) {
                  persist({ ...local, queue: [] });
                  setMessage("");
                  void synchronize();
                }
              }}
            >
              Annuler les changements en attente
            </Button>
          </div>
        )}
      </div>
      <nav aria-label="Listes de courses" className="flex flex-wrap gap-2">
        {data.lists.map((l) => (
          <Button
            key={l.id}
            type="button"
            variant={l.id === list?.id ? "default" : "outline"}
            onClick={() => setListId(l.id)}
          >
            {l.name} ·{" "}
            {
              data.items.filter(
                (i) => i.listId === l.id && !i.checked && !i.deletedAt,
              ).length
            }
          </Button>
        ))}
      </nav>
      {list && (
        <>
          <section className="panel">
            <h2 className="mb-5 text-xl font-semibold">{list.name}</h2>
            <form onSubmit={(e) => submit(e)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem_10rem]">
                <Field label="Article" name="name" required maxLength={120} />
                <Field
                  label="Quantité"
                  name="quantity"
                  defaultValue="1"
                  required
                  maxLength={80}
                />
                <Field
                  label="Catégorie"
                  name="category"
                  defaultValue="Autres"
                  maxLength={80}
                />
              </div>
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Associer à un équipement ou entretien
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">
                    Équipement
                    <select
                      className="mt-2 block min-h-11 w-full rounded-xl border bg-surface px-3"
                      name="equipmentId"
                    >
                      <option value="">Aucun</option>
                      {data.equipmentOptions?.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Entretien
                    <select
                      className="mt-2 block min-h-11 w-full rounded-xl border bg-surface px-3"
                      name="maintenanceId"
                    >
                      <option value="">Aucun</option>
                      {data.taskOptions?.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </details>
              <Button>Ajouter à la liste</Button>
            </form>
          </section>
          {groups.map((group) => (
            <section className="panel" key={group}>
              <h3 className="mb-3 font-semibold">{group}</h3>
              <div className="divide-y">
                {items
                  .filter((i) => (i.category || "Autres") === group)
                  .sort(
                    (a, b) =>
                      Number(a.checked) - Number(b.checked) ||
                      a.name.localeCompare(b.name, "fr"),
                  )
                  .map((i) => (
                    <div key={i.id} className="py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={i.checked}
                          aria-label={`${i.checked ? "Décocher" : "Cocher"} ${i.name}`}
                          className={`size-11 shrink-0 rounded-xl border transition-colors ${i.checked ? "bg-primary text-white" : "bg-surface"}`}
                          onClick={() =>
                            mutate({
                              kind: "checked",
                              id: i.id,
                              checked: !i.checked,
                            })
                          }
                        >
                          {i.checked ? "✓" : ""}
                        </button>
                        <p
                          className={`min-w-0 flex-1 break-words text-sm ${i.checked ? "line-through text-muted-foreground" : ""}`}
                        >
                          {i.quantity} × {i.name}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Modifier ${i.name}`}
                          onClick={() => setEdit(edit === i.id ? null : i.id)}
                        >
                          Modifier
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Retirer ${i.name}`}
                          onClick={() =>
                            mutate({
                              kind: "delete",
                              id: i.id,
                              revision: i.revision,
                            })
                          }
                        >
                          Retirer
                        </Button>
                      </div>
                      {edit === i.id && (
                        <form
                          className="mt-4 space-y-3"
                          onSubmit={(e) => submit(e, i.id)}
                        >
                          <Field
                            label="Nom de l’article"
                            name="name"
                            defaultValue={i.name}
                            required
                            maxLength={120}
                          />
                          <Field
                            label="Quantité de l’article"
                            name="quantity"
                            defaultValue={i.quantity}
                            required
                            maxLength={80}
                          />
                          <Field
                            label="Catégorie de l’article"
                            name="category"
                            defaultValue={i.category}
                            maxLength={80}
                          />
                          <Button>Enregistrer l’article</Button>
                        </form>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          ))}
          {!items.length && <p className="panel text-sm">Ta liste est vide.</p>}
          {items.some((i) => i.checked) && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (
                  !confirm(
                    "Retirer les articles achetés ? Tu pourras les rétablir.",
                  )
                )
                  return;
                const operations = items
                  .filter((i) => i.checked)
                  .map((i) => ({
                    kind: "delete",
                    id: i.id,
                    revision: i.revision,
                    mutationId: crypto.randomUUID(),
                  }));
                if (!navigator.onLine && !opted.current) return;
                persist({
                  ...current.current!,
                  queue: [...current.current!.queue, ...operations],
                });
                void synchronize();
              }}
            >
              Vider les articles achetés
            </Button>
          )}
          {deleted.length > 0 && (
            <details className="panel">
              <summary className="cursor-pointer text-sm">
                Articles retirés · annuler une suppression
              </summary>
              <ul className="mt-4 space-y-2">
                {deleted.map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>{i.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        mutate({ kind: "undo", id: i.id, revision: i.revision })
                      }
                    >
                      Rétablir
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
