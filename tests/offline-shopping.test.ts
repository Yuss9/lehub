import "fake-indexeddb/auto";
import { beforeAll, beforeEach, it, expect } from "vitest";
import {
  updateShopping,
  readShopping,
  clearShopping,
  discardArticle,
  type LocalShopping,
} from "@/lib/offline-shopping";
const initial: LocalShopping = {
  state: {
    scope: "a:home",
    owner: "Alice",
    household: "Maison",
    lists: [],
    items: [],
  },
  queue: [],
  savedAt: "2026-01-01",
};
beforeAll(() => {
  Object.defineProperty(globalThis, "window", {
    value: new EventTarget(),
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: { removeItem() { } },
    configurable: true,
  });
});
beforeEach(() => clearShopping());
it("serializes two independent tabs adding changes from the same stale snapshot", async () => {
  await Promise.all(
    ["first", "second"].map((id) =>
      updateShopping(
        initial.state.scope,
        structuredClone(initial),
        (current) => ({
          ...current,
          queue: [
            ...current.queue,
            { kind: "checked", id, mutationId: id, checked: true },
          ],
        }),
      ),
    ),
  );
  expect((await readShopping())!.queue.map((m) => m.id)).toEqual([
    "first",
    "second",
  ]);
});
it("an acknowledgement removes only its mutation while another tab adds a change", async () => {
  await updateShopping(initial.state.scope, initial, (current) => ({
    ...current,
    queue: [{ kind: "checked", id: "1", mutationId: "1" }],
  }));
  await Promise.all([
    updateShopping(initial.state.scope, initial, (current) => ({
      ...current,
      queue: current.queue.filter((m) => m.mutationId !== "1"),
    })),
    updateShopping(initial.state.scope, initial, (current) => ({
      ...current,
      queue: [...current.queue, { kind: "checked", id: "2", mutationId: "2" }],
    })),
  ]);
  expect((await readShopping())!.queue.map((m) => m.id)).toEqual(["2"]);
});
it("discards only a conflicted article and its dependent operations", () => {
  const queue = [
    { kind: "edit", id: "1", mutationId: "a", conflict: "stale" },
    { kind: "delete", id: "1", mutationId: "b" },
    { kind: "edit", id: "2", mutationId: "c" },
  ];
  expect(
    discardArticle({ ...initial, queue }, "1").queue.map((m) => m.id),
  ).toEqual(["2"]);
});
it("keeps queues separate when a different household is opened, and clears all on logout", async () => {
  await updateShopping(initial.state.scope, initial, (current) => ({
    ...current,
    queue: [{ kind: "checked", id: "a", mutationId: "a" }],
  }));
  const other = { ...initial, state: { ...initial.state, scope: "a:other" } };
  await updateShopping(other.state.scope, other, (current) => current);
  expect((await readShopping(initial.state.scope))!.queue).toHaveLength(1);
  expect((await readShopping())!.state.scope).toBe(other.state.scope);
  await clearShopping();
  expect(await readShopping(initial.state.scope)).toBeNull();
});

it("disabling one household preserves other queues and demands consent for every pending ID", async () => {
  const { removeShopping, writeShopping } = await import("@/lib/offline-shopping");
  const first = { ...initial, queue: [{ kind: "add", id: "1", mutationId: "old" }] };
  const other = { ...initial, state: { ...initial.state, scope: "a:other" }, queue: [{ kind: "add", id: "2", mutationId: "other" }] };
  await writeShopping(first);
  await writeShopping(other);
  expect((await removeShopping(first.state.scope))?.queue).toHaveLength(1);
  await updateShopping(first.state.scope, first, (current) => ({ ...current, queue: [...current.queue, { kind: "add", id: "3", mutationId: "new" }] }));
  // A confirmation based on an older tab must not discard the new mutation.
  expect((await removeShopping(first.state.scope, ["old"]))?.queue).toHaveLength(2);
  expect(await removeShopping(first.state.scope, ["old", "new"])).toBeNull();
  expect(await readShopping(first.state.scope)).toBeNull();
  expect((await readShopping(other.state.scope))!.queue[0].mutationId).toBe("other");
  // A late sync acknowledgement cannot recreate the deleted queue from its fallback.
  await expect(updateShopping(first.state.scope, first, (current) => current)).rejects.toThrow();
  await writeShopping({ ...first, queue: [] });
  expect((await readShopping(first.state.scope))!.queue).toEqual([]);
});
