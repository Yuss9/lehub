"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Field } from "./form";
import {
  clearShopping,
  projectShopping,
  readShopping,
  writeShopping,
  updateShopping,
  migrateShopping,
  watchShopping,
  discardArticle,
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
  const [cacheReady, setCacheReady] = useState(false);
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
  const writes = useRef(0);
  const [saving, setSaving] = useState(false);
  async function persist(change: (value: LocalShopping) => LocalShopping) {
    if (!current.current) return;
    writes.current++;
    setSaving(true);
    try {
      const next = opted.current
        ? await updateShopping(
            current.current.state.scope,
            current.current,
            change,
          )
        : change(current.current);
      current.current = next;
      setLocal(next);
    } finally {
      writes.current--;
      setSaving(writes.current > 0);
    }
  }

  async function synchronize() {
    if (navigator.locks)
      await navigator.locks.request("lehub-shopping-sync", () =>
        synchronizeNow(),
      );
    else await synchronizeNow();
  }
  async function synchronizeNow() {
    if (syncing.current || !navigator.onLine) return;
    syncing.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/shopping", { cache: "no-store" });
      if (response.status === 401 || response.redirected) {
        await clearShopping();
        current.current = null;
        setLocal(null);
        setMessage("Reconnecte-toi pour accéder aux courses.");
        return;
      }
      if (!response.ok) throw Error("Actualisation impossible.");
      const server: ShoppingState = await response.json();
      if (current.current && current.current.state.scope !== server.scope) {
        if (
          current.current.state.scope.split(":")[0] !==
          server.scope.split(":")[0]
        ) {
          await clearShopping();
          current.current = null;
          setLocal(null);
        }
        setMessage(
          "Le compte ou le foyer actif a changé. Actualise cette page. Les changements du foyer précédent restent conservés sur cet appareil.",
        );
        return;
      }
      if (opted.current) {
        const cached = await readShopping(current.current?.state.scope);
        if (!cached || cached.state.scope !== server.scope) return;
        current.current = cached;
        setLocal(cached);
      }
      const queue = current.current?.queue || [];
      const blocked = new Set(queue.filter((m) => m.conflict).map((m) => m.id));
      for (const mutation of [...queue]) {
        if (blocked.has(mutation.id)) continue;
        const sent = await fetch("/api/shopping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: server.scope, mutation }),
        });
        if (sent.status === 401) {
          await clearShopping();
          current.current = null;
          setLocal(null);
          return;
        }
        if (!sent.ok) {
          if (sent.status >= 500 || sent.status === 429)
            throw Error("Service indisponible");
          const error = await sent.json();
          blocked.add(mutation.id);
          await persist((value) => ({
            ...value,
            queue: value.queue.map((m) =>
              m.mutationId === mutation.mutationId
                ? { ...m, conflict: error.error || "Cet article a changé." }
                : m,
            ),
          }));
          continue;
        }
        await persist((value) => ({
          ...value,
          state: value.queue.some((m) => m.mutationId === mutation.mutationId)
            ? projectShopping(value.state, [mutation])
            : value.state,
          queue: value.queue.filter(
            (m) => m.mutationId !== mutation.mutationId,
          ),
        }));
      }
      const refreshed = await fetch("/api/shopping", { cache: "no-store" });
      if (!refreshed.ok) throw Error();
      const state: ShoppingState = await refreshed.json();
      if (state.scope !== server.scope) {
        setMessage(
          "Le foyer actif a changé pendant la synchronisation. Actualise la page ; tes changements restent conservés.",
        );
        return;
      }
      await persist((value) => ({
        ...value,
        state,
        savedAt: new Date().toISOString(),
      }));
      setMessage(
        blocked.size
          ? "Certains articles demandent ton choix. Les autres changements ont été synchronisés."
          : "",
      );
    } catch {
      setMessage("Connexion indisponible. Les changements restent en attente.");
    } finally {
      syncing.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void (async () => {
      await migrateShopping();
      const active = await readShopping();
      if (
        initial &&
        active &&
        initial.scope.split(":")[0] !== active.state.scope.split(":")[0]
      )
        await clearShopping();
      const cached = await readShopping(initial?.scope);
      if (cached && (!initial || cached.state.scope === initial.scope)) {
        opted.current = true;
        setEnabled(true);
        setCacheReady(true);
        current.current = cached;
        setLocal(cached);
        setListId(selectedList || cached.state.lists[0]?.id || "");
      } else if (cached) await clearShopping();
      setOnline(navigator.onLine);
      void synchronize();
    })().catch(() =>
      setMessage(
        "Stockage indisponible. Les courses hors ligne ne peuvent pas être conservées.",
      ),
    );
    const unwatch = watchShopping(() => {
      void readShopping(current.current?.state.scope).then((cached) => {
        if (cached && cached.state.scope === current.current?.state.scope) {
          current.current = cached;
          setLocal(cached);
        } else {
          opted.current = false;
          setEnabled(false);
        }
      });
    });
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void synchronize();
    };
    const leaving = (event: BeforeUnloadEvent) => {
      if (writes.current > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leaving);
    const purge = () => {
      opted.current = false;
      setEnabled(false);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("lehub-offline-cleared", purge);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void synchronize();
    }, 10000);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", leaving);
      unwatch();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("lehub-offline-cleared", purge);
    };
    // Mount once; polling reads the mutable queue ref, never a stale render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function mutate(m: Omit<PendingShopping, "mutationId">) {
    if (!current.current) return false;
    if (!navigator.onLine && !opted.current) {
      setMessage("Active d’abord la conservation hors ligne sur cet appareil.");
      return false;
    }
    try {
      await persist((value) => {
        const item = projectShopping(value.state, value.queue).items.find(
          (i) => i.id === m.id,
        );
        return {
          ...value,
          queue: [
            ...value.queue,
            {
              ...m,
              ...(m.revision !== undefined && item
                ? { revision: item.revision }
                : {}),
              mutationId: crypto.randomUUID(),
            },
          ],
        };
      });
      void synchronize();
      return true;
    } catch {
      setMessage(
        "Enregistrement local impossible. Réessaie avant de fermer la page.",
      );
      return false;
    }
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
  async function submit(event: React.FormEvent<HTMLFormElement>, id?: string) {
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
    const saved = await mutate({
      kind: id ? "edit" : "add",
      id: id || crypto.randomUUID(),
      ...(item ? { revision: item.revision } : {}),
      data: values,
    });
    if (saved) {
      if (id) setEdit(null);
      else form.reset();
    }
  }
  return (
    <div className="space-y-5">
      <div className="panel space-y-3">
        <p className="text-xs text-muted-foreground">
          {data.owner} · {data.household}
        </p>
        <p className="text-sm" role="status">
          {online ? "Connecté" : "Hors ligne"} ·{" "}
          {saving
            ? "Enregistrement sur cet appareil…"
            : local.queue.length
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
              setCacheReady(false);
              if (e.target.checked)
                void writeShopping(current.current || local)
                  .then(() => setCacheReady(true))
                  .catch(() => {
                    opted.current = false;
                    setEnabled(false);
                    setMessage("Stockage indisponible.");
                  });
              else void clearShopping();
            }}
          />{" "}
          Conserver mes courses hors ligne sur cet appareil
        </label>
        {enabled && (
          <p className="text-xs text-muted-foreground" role="status">
            {cacheReady
              ? "Courses conservées sur cet appareil."
              : "Préparation du stockage hors ligne…"}
          </p>
        )}
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
          </div>
        )}
      </div>
      {[...new Set(local.queue.filter((m) => m.conflict).map((m) => m.id))].map(
        (id) => {
          const mutation = local.queue.find((m) => m.id === id && m.conflict)!;
          const item = local.state.items.find((i) => i.id === id);
          return (
            <section className="panel space-y-3" key={id}>
              <h2 className="font-semibold">
                Conflit ·{" "}
                {mutation.data?.name || item?.name || "Article retiré"}
              </h2>
              <p className="text-sm" role="alert">
                {mutation.conflict}
              </p>
              {item && (
                <p className="text-sm">
                  Version actuelle : {item.quantity} × {item.name}
                  {item.deletedAt ? " · retiré" : ""}
                </p>
              )}
              <Button
                type="button"
                disabled={busy}
                variant="outline"
                onClick={() =>
                  void persist((value) => discardArticle(value, id)).then(() =>
                    synchronize(),
                  )
                }
              >
                Abandonner les changements de cet article
              </Button>
              {item && !item.deletedAt && mutation.kind === "edit" && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void persist((value) => {
                      const latest = value.state.items.find(
                        (i) => i.id === id,
                      )!;
                      let revision = latest.revision;
                      return {
                        ...value,
                        queue: value.queue.map((m) =>
                          m.id === id
                            ? {
                                ...m,
                                conflict: undefined,
                                mutationId: crypto.randomUUID(),
                                revision: revision++,
                              }
                            : m,
                        ),
                      };
                    }).then(() => synchronize())
                  }
                >
                  Appliquer mes changements à la version actuelle
                </Button>
              )}
            </section>
          );
        },
      )}
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
              <Button disabled={saving}>Ajouter à la liste</Button>
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
                void persist((value) => ({
                  ...value,
                  queue: [...value.queue, ...operations],
                })).then(() => synchronize());
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
