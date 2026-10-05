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
};
export type LocalShopping = {
  state: ShoppingState;
  queue: PendingShopping[];
  savedAt: string;
};
const KEY = "lehub-shopping-v1";
// Explicit opt-in, one account per device. Never cache credentials, documents or private HTML.
export function readShopping(): LocalShopping | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function writeShopping(value: LocalShopping) {
  localStorage.setItem(KEY, JSON.stringify(value));
}
export function clearShopping() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("lehub-offline-cleared"));
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
