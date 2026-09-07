import { describe, expect, it } from "vitest";
import { SetJournal } from "./set-journal";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function locks() {
  let tail = Promise.resolve();
  return async <T,>(action: () => Promise<T>): Promise<T> => {
    const result = tail.then(action);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
const session = () => ({ id: 1, telegram_user_id: 42, status: "in_progress", planned_exercises: [
  { id: 5, exercise: { name: "Press" }, target_sets: 3, status: "in_progress", performed_sets: [] },
] });
const payload = { set_number: 1, reps: 10, weight: 40 };

describe("durable set journal", () => {
  it("restores an offline session and its exact pending input after reload, scoped to the user", async () => {
    const disk = storage();
    const lock = locks();
    const first = new SetJournal("42", disk, lock);
    await first.remember(session());
    await first.enqueue(1, 5, payload);
    const reopened = new SetJournal("42", disk, lock);
    expect(reopened.read().activeId).toBe(1);
    expect(reopened.view(1).planned_exercises[0].performed_sets[0]).toMatchObject({ ...payload, pending: true });
    expect(new SetJournal("7", disk, lock).read().pending).toEqual([]);
    await expect(first.remember({ ...session(), telegram_user_id: 7 })).rejects.toThrow();
  });

  it("keeps an ambiguous write across reload and replays the same request id", async () => {
    const disk = storage();
    const lock = locks();
    const first = new SetJournal("42", disk, lock);
    await first.remember(session());
    await first.enqueue(1, 5, payload);
    const receipts = new Map();
    let saved = session();
    const server = async (_method: string, _path: string, body: any) => {
      if (!receipts.has(body.request_id)) {
        saved.planned_exercises[0].performed_sets.push({ ...body, id: 99 } as never);
        receipts.set(body.request_id, true);
        throw new TypeError("Response lost");
      }
      return saved;
    };
    await first.sync(1, server);
    expect(first.read().pending).toHaveLength(1);
    const reopened = new SetJournal("42", disk, lock);
    await reopened.sync(1, server);
    expect(reopened.read().pending).toEqual([]);
    expect(reopened.view(1).planned_exercises[0].performed_sets).toHaveLength(1);
    expect(reopened.view(1).planned_exercises[0].performed_sets[0].pending).toBeUndefined();
  });

  it("retains validation/auth/conflict errors, blocks finish, and allows explicit retry", async () => {
    for (const status of [401, 403, 409, 422]) {
      const journal = new SetJournal("42", storage(), locks());
      await journal.remember(session());
      await journal.enqueue(1, 5, payload);
      await journal.sync(1, async () => { throw Object.assign(new Error("Rejected"), { status }); });
      expect(journal.read().pending[0].error).toContain("Rejected");
      await expect(journal.guard(1, async () => "finished")).rejects.toThrow();
      let called = false;
      await journal.sync(1, async () => { called = true; return session(); });
      expect(called).toBe(false);
      await journal.sync(1, async () => ({ ...session(), planned_exercises: [{ ...session().planned_exercises[0], performed_sets: [{...payload, id: 99}] }] }), true);
      expect(journal.read().pending).toHaveLength(0);
    }
  });

  it("serializes tabs and rejects a second intent for the same numbered set", async () => {
    const disk = storage();
    const lock = locks();
    const a = new SetJournal("42", disk, lock);
    const b = new SetJournal("42", disk, lock);
    await a.remember(session());
    const result = await Promise.allSettled([a.enqueue(1, 5, payload), b.enqueue(1, 5, {...payload, reps: 12})]);
    expect(result.filter(item => item.status === "rejected")).toHaveLength(1);
    expect(a.read().pending).toHaveLength(1);
    await b.enqueue(1, 5, { ...payload, set_number: 2 });
    expect(a.read().pending).toHaveLength(2);
  });

  it("does not accept an undurable set when storage is blocked or corrupt", async () => {
    const disk = storage();
    const journal = new SetJournal("42", disk, locks());
    await journal.remember(session());
    disk.setItem = () => { throw new Error("quota"); };
    await expect(journal.enqueue(1, 5, payload)).rejects.toThrow();
    expect(journal.read().pending).toEqual([]);
    const corrupt = new SetJournal("42", { getItem: () => "broken", setItem: () => { throw new Error("Must not overwrite"); } }, locks());
    expect(() => corrupt.read()).toThrow();
  });
});
