import { QueryClient } from "@tanstack/react-query";
import { h, options } from "preact";
import { useRef, useState } from "preact/hooks";
import render from "preact-render-to-string";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("location", new URL("https://gym.test/demo"));
});

vi.mock("preact/hooks", async (importOriginal) => {
  const hooks = await importOriginal<typeof import("preact/hooks")>();
  return {
    ...hooks,
    useEffect: vi.fn(),
    useRef: vi.fn(hooks.useRef),
    useState: vi.fn(hooks.useState),
  };
});

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  QueryClientProvider: ({ children, client: providedClient }: any) => {
    client = providedClient;
    return children;
  },
  useQueryClient: () => client,
}));
vi.mock("../lib/set-journal", () => ({ getSetJournal: vi.fn() }));
vi.mock("../lib/telegram", () => ({ inTelegram: () => false, tg: undefined }));
vi.mock("../lib/api", async (importOriginal) => {
  const api = await importOriginal<typeof import("../lib/api")>();
  return { ...api, apiFetch: vi.fn(api.apiFetch) };
});
vi.mock("../features/workout/Home", () => ({ Home: () => {
  context = useApp();
  return h("main", null, "home-screen");
} }));
vi.mock("../features/workout/Plan", () => ({ Plan: () => {
  context = useApp();
  return h("main", null, "plan-screen");
} }));
vi.mock("../features/workout/Exercise", () => ({ Exercise: () => {
  context = useApp();
  return h("main", null, "exercise-screen");
} }));
vi.mock("../components/navigation", () => ({ TabBar: () => null }));

import App, { useApp } from "./App";
import { apiFetch } from "../lib/api";
import { demoFetch } from "../lib/demo";
import { getSetJournal } from "../lib/set-journal";

import { parseLaunchRoute } from "./routes";

let client: QueryClient;
let context: ReturnType<typeof useApp>;
let fields: any[];
let refs: any[];
let resetButton: any;

function renderApp() {
  let stateIndex = 0;
  let refIndex = 0;
  vi.mocked(useState).mockImplementation(((initial: any) => {
    const index = stateIndex++;
    if (!(index in fields)) fields[index] = typeof initial === "function" ? initial() : initial;
    return [fields[index], (next: any) => {
      fields[index] = typeof next === "function" ? next(fields[index]) : next;
    }];
  }) as typeof useState);
  vi.mocked(useRef).mockImplementation(((initial: any) => {
    const index = refIndex++;
    return refs[index] ??= { current: initial };
  }) as typeof useRef);
  resetButton = undefined;
  const previousVNode = options.vnode;
  options.vnode = (vnode) => {
    previousVNode?.(vnode);
    if (vnode.type === "button" && vnode.props["aria-label"] === "Reiniciar demo") {
      resetButton = vnode.props;
    }
  };
  try {
    return render(h(App, {}));
  } finally {
    options.vnode = previousVNode;
  }
}

beforeEach(async () => {
  vi.stubGlobal("location", new URL("https://gym.test/demo"));
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real API must not run"); }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fields = [];
  refs = [];
  vi.mocked(getSetJournal).mockImplementation(() => {
    throw new Error("Journal must not run");
  });
  await demoFetch("POST", "/demo/reset");
});

afterEach(() => {
  client.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("App demo integration", () => {
  it("renders a writable public demo without restoring or accessing the journal", () => {
    const html = renderApp();
    expect(html).toContain("home-screen");
    expect(context.demoMode).toBe(true);
    expect(context.readOnly).toBe(false);
    expect(context.sessionId).toBeUndefined();
    expect(context.workoutSync?.journal).toBeUndefined();
    expect(getSetJournal).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resets demo data, query/mutation caches, session selection and the navigation stack", async () => {
    renderApp();
    context.openSession(999);
    context.push({ name: "exercise", plannedId: 888 });
    await demoFetch("PATCH", "/profile", { goal: "Changed demo goal" });
    client.setQueryData(["session", 999], { id: 999 });
    client.setQueryData(["profile"], { goal: "Changed demo goal" });
    client.getMutationCache().build(client, { mutationKey: ["old-demo-write"] });
    const cancel = vi.spyOn(client, "cancelQueries");
    const clear = vi.spyOn(client, "clear");
    expect(renderApp()).toContain("exercise-screen");
    expect(resetButton).toBeDefined();
    expect(resetButton.title).toBe("Reiniciar demo");
    await resetButton.onClick();
    expect(apiFetch).toHaveBeenCalledWith("POST", "/demo/reset");
    expect(cancel).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect((await demoFetch("GET", "/profile")).goal).not.toBe("Changed demo goal");
    expect(renderApp()).toContain("home-screen");
    expect(context.sessionId).toBeUndefined();
    context.pop();
    expect(renderApp()).toContain("home-screen");
    expect(getSetJournal).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps genuine shares read-only and hides the demo reset", () => {
    vi.stubGlobal("location", new URL("https://gym.test/session/share/genuine-token/exercise/5"));
    expect(renderApp()).toContain("exercise-screen");
    expect(context.readOnly).toBe(true);
    expect(context.shareToken).toBe("genuine-token");
    expect(resetButton).toBeUndefined();
    expect(getSetJournal).not.toHaveBeenCalled();
  });

  it("ignores duplicate resets and discards queries completing after the reset", async () => {
    renderApp();
    let resolveQuery!: (value: any) => void;
    const lateQuery = client.fetchQuery({
      queryKey: ["session", 999],
      queryFn: () => new Promise((resolve) => { resolveQuery = resolve; }),
    }).catch(() => undefined);
    let resolveReset!: (value: any) => void;
    vi.mocked(apiFetch).mockImplementationOnce(() => new Promise((resolve) => {
      resolveReset = resolve;
    }));
    const click = resetButton.onClick;
    const pending = click();
    await click();
    await vi.waitFor(() => expect(resolveReset).toBeDefined());
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(renderApp()).not.toContain("home-screen");
    expect(resetButton.disabled).toBe(true);
    resolveReset({ ok: true });
    await pending;
    resolveQuery({ id: 999 });
    await lateQuery;
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(renderApp()).toContain("home-screen");
    expect(resetButton.disabled).toBe(false);
  });

  it("preserves the selected session and cache when reset fails, and allows retry", async () => {
    renderApp();
    context.openSession(999);
    client.setQueryData(["session", 999], { id: 999 });
    renderApp();
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Reset failed"));
    await resetButton.onClick();
    const html = renderApp();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Reset failed");
    expect(html).toContain("plan-screen");
    expect(context.sessionId).toBe(999);
    expect(client.getQueryData(["session", 999])).toEqual({ id: 999 });
    expect(resetButton.disabled).toBe(false);
    await resetButton.onClick();
    expect(renderApp()).toContain("home-screen");
    expect(context.sessionId).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(getSetJournal).not.toHaveBeenCalled();
  });
});

describe("parseLaunchRoute", () => {
  it("parses authenticated owner routes as editable session navigation", () => {
    expect(parseLaunchRoute("/session/12/exercise/7")).toEqual({
      sessionId: 12,
      plannedExerciseId: 7,
      shareToken: undefined,
      readOnly: false,
    });
  });

  it("keeps share-token routes read-only even when an exercise is targeted", () => {
    expect(parseLaunchRoute("/session/share/demo-token/exercise/5")).toEqual({
      sessionId: undefined,
      plannedExerciseId: 5,
      shareToken: "demo-token",
      readOnly: true,
    });
  });

  it("rejects invalid ids instead of treating them as writable owner routes", () => {
    expect(parseLaunchRoute("/session/not-a-number/exercise/7")).toEqual({
      sessionId: undefined,
      plannedExerciseId: undefined,
      shareToken: undefined,
      readOnly: false,
    });
    expect(parseLaunchRoute("/session/12/exercise/nope")).toEqual({
      sessionId: 12,
      plannedExerciseId: undefined,
      shareToken: undefined,
      readOnly: false,
    });
  });
});
