export type ShoppingState = {
  equipmentOptions?: { id: string; name: string }[];
  taskOptions?: { id: string; name: string }[];
  scope: string;
  owner: string;
  household: string;
  lists: { id: string; name: string; revision: number }[];
  items: {
    id: string;
    listId: string;
    name: string;
    quantity: string;
    category: string;
    checked: boolean;
    revision: number;
    equipmentId: string | null;
    maintenanceId: string | null;
    deletedAt: string | null;
  }[];
};
export type PendingShopping = {
  kind: string;
  mutationId: string;
  id: string;
  revision?: number;
  checked?: boolean;
  data?: Record<string, string>;
  conflict?: string;
};
export type LocalShopping = {
  state: ShoppingState;
  queue: PendingShopping[];
  savedAt: string;
};
const KEY = "lehub-shopping-v1";
const EVENT = "lehub-shopping-updated";
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return (connection ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("lehub-shopping", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("cache");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
function announce() {
  window.dispatchEvent(new Event(EVENT));
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(EVENT)
      : null;
  channel?.postMessage("refresh");
  channel?.close();
}
// A read and its write happen in ONE IndexedDB transaction, serialized across tabs.
// Callers submit operations, never a stale copy of the whole queue.
export async function updateShopping(
  scope: string,
  fallback: LocalShopping,
  change: (current: LocalShopping) => LocalShopping,
): Promise<LocalShopping> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cache", "readwrite");
    const store = tx.objectStore("cache");
    let next: LocalShopping;
    const request = store.get(scope);
    request.onsuccess = () => {
      const saved = request.result as LocalShopping | undefined;
      next = change(saved || fallback);
      store.put(next, scope);
      store.put(scope, "active");
    };
    tx.oncomplete = () => {
      announce();
      resolve(next);
    };
    tx.onabort = tx.onerror = () =>
      reject(tx.error || Error("Le foyer actif a changé."));
  });
}
export async function readShopping(
  scope?: string,
): Promise<LocalShopping | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const store = db.transaction("cache").objectStore("cache");
    function read(key: string) {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    }
    if (scope) read(scope);
    else {
      const request = store.get("active");
      request.onsuccess = () =>
        request.result ? read(request.result) : resolve(null);
      request.onerror = () => reject(request.error);
    }
  });
}
export async function writeShopping(value: LocalShopping) {
  // Used only for initial opt-in; preserve another tab's pending operations.
  return updateShopping(value.state.scope, value, (current) => current);
}
export async function migrateShopping() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return;
  const old = JSON.parse(raw) as LocalShopping;
  await writeShopping(old);
  localStorage.removeItem(KEY);
}
export async function clearShopping() {
  localStorage.removeItem(KEY);
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("cache", "readwrite");
    tx.objectStore("cache").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  window.dispatchEvent(new Event("lehub-offline-cleared"));
  announce();
}
export function watchShopping(refresh: () => void) {
  window.addEventListener(EVENT, refresh);
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(EVENT)
      : null;
  if (channel) channel.onmessage = refresh;
  return () => {
    window.removeEventListener(EVENT, refresh);
    channel?.close();
  };
}
export function discardArticle(
  value: LocalShopping,
  id: string,
): LocalShopping {
  return { ...value, queue: value.queue.filter((m) => m.id !== id) };
}
export function projectShopping(
  state: ShoppingState,
  queue: PendingShopping[],
): ShoppingState {
  const items = state.items.map((i) => ({ ...i }));
  for (const m of queue) {
    const item = items.find((i) => i.id === m.id);
    if (m.kind === "add" && !item && m.data)
      items.push({
        ...m.data,
        id: m.id,
        listId: m.data.listId,
        name: m.data.name,
        quantity: m.data.quantity,
        category: m.data.category,
        checked: false,
        revision: 0,
        equipmentId: m.data.equipmentId || null,
        maintenanceId: m.data.maintenanceId || null,
        deletedAt: null,
      });
    else if (item) {
      if (m.kind === "checked") item.checked = !!m.checked;
      if (m.kind === "edit" && m.data)
        Object.assign(item, m.data, {
          equipmentId: m.data.equipmentId || null,
          maintenanceId: m.data.maintenanceId || null,
        });
      if (m.kind === "delete") item.deletedAt = new Date().toISOString();
      if (m.kind === "undo") item.deletedAt = null;
      item.revision++;
    }
  }
  return { ...state, items };
}
