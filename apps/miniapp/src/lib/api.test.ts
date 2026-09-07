import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./demo", () => ({ isDemoMode: () => false }));
vi.mock("./telegram", () => ({ tg: undefined }));

beforeEach(() => {
  vi.resetModules();
  const values = new Map();
  vi.stubGlobal("location", {origin: "https://gym.test"});
  vi.stubGlobal("window", { Telegram: { WebApp: { initData: new URLSearchParams({user: JSON.stringify({id: 42})}).toString() } }, localStorage: {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value)}, dispatchEvent() {} });
  vi.stubGlobal("navigator", { locks: {request: async (_name: string, action: () => any) => action()} });
});

it("prevents finish and corrections at the request boundary while a durable write is unresolved", async () => {
  const {getSetJournal} = await import("./set-journal");
  const journal = getSetJournal()!;
  await journal.remember({id: 1, telegram_user_id: 42, planned_exercises: [{id: 5, performed_sets: []}]});
  await journal.enqueue(1, 5, {set_number: 1, reps: 10});
  const {apiFetch} = await import("./api");
  vi.stubGlobal("fetch", () => { throw new Error("Network must not run"); });
  for (const [method, path] of [["POST", "/sessions/1/finish"], ["POST", "/sessions/1/exercises/5/complete"], ["DELETE", "/sessions/1/exercises/5/sets/99"]]) {
    await expect(apiFetch(method, path)).rejects.toThrow("pendientes");
  }
});

it("preserves HTTP status and readable validation detail for durable error handling", async () => {
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({detail: [{msg: "Invalid reps"}]}), {status: 422}));
  const {apiFetch} = await import("./api");
  await expect(apiFetch("GET", "/sessions/1")).rejects.toMatchObject({status: 422, message: expect.stringContaining("Invalid reps")});
});
