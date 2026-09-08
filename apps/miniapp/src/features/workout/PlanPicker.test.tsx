import { h, options } from "preact";
import render from "preact-render-to-string";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";
import * as planView from "./Plan";
import { ConfirmSheet } from "../../components/sheet";

let fields: any[] = [];
let cursor = 0;
let mutation: any;
let mutations: any[] = [];
const mutate = vi.fn();
const access = vi.hoisted(() => ({ readOnly: false, pending: [] as any[] }));
const catalog = [
  { id: 10, name: "Cardio", activity_type: "cardio" },
  { id: 20, name: "Plank", activity_type: "strength", equipment: "dumbbell" },
  { id: 30, name: "Flexiones", activity_type: "strength", equipment: "body weight" },
];

vi.mock("preact/hooks", async (importOriginal) => ({
  ...await importOriginal<typeof import("preact/hooks")>(),
  useState: (initial: any) => {
    const index = cursor++;
    if (!(index in fields)) fields[index] = typeof initial === "function" ? initial() : initial;
    return [fields[index], (next: any) => { fields[index] = typeof next === "function" ? next(fields[index]) : next; }];
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: catalog }),
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
  useMutation: (config: any) => { mutation = config; mutations.push(config); return { isPending: false, mutate }; },
}));
vi.mock("../../app/App", () => ({ useApp: () => ({ readOnly: access.readOnly, workoutSync: { state: { pending: access.pending } } }) }));
vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("../../lib/telegram", () => ({ haptic: vi.fn() }));

function text(node: any): string {
  if (Array.isArray(node)) return node.map(text).join("");
  return typeof node === "string" ? node : node?.props ? text(node.props.children) : "";
}

function picker(props: Record<string, any> = {}) {
  cursor = 0;
  const nodes: any[] = [];
  const previous = options.vnode;
  options.vnode = (node) => { previous?.(node); nodes.push(node); };
  try {
    const html = render(h(planView.PlanExercisePicker, {
      sessionId: 1, planStatus: "in_progress", mode: "add", onDismiss: vi.fn(), ...props,
    }));
    return {
      html,
      choose: (name: string) => nodes.find(node => node.type === "button" && text(node).startsWith(name))?.props.onClick(),
      input: (name: string) => nodes.find(node => node.type === "input" && node.props["aria-label"] === name)?.props,
      toggle: (name: string, checked: boolean) => {
        const label = nodes.find(node => node.type === "label" && text(node).trim() === name);
        const input = [label?.props.children].flat().find(node => node?.type === "input");
        expect(input, `toggle ${name}`).toBeDefined();
        input.props.onChange({ target: { checked } });
      },
      save: () => mutation.mutationFn(),
    };
  } finally { options.vnode = previous; }
}

beforeEach(() => {
  fields = [];
  mutations = [];
  mutate.mockClear();
  access.readOnly = false;
  access.pending = [];
  vi.mocked(apiFetch).mockClear();
});

describe("shared delete confirmation", () => {
  function actions(exercise = { planned_id: 4, name: "Press", performed_sets: [] as any[] }) {
    cursor = 0;
    mutations = [];
    const nodes: any[] = [];
    const previous = options.vnode;
    options.vnode = (node) => { previous?.(node); nodes.push(node); };
    try {
      render(h(planView.WorkoutExerciseActions, { sessionId: 1, planStatus: "in_progress", exercise }));
      return {
        open: () => nodes.find(node => node.type === "button" && text(node) === "Eliminar").props.onClick(),
        confirm: () => nodes.find(node => node.type === ConfirmSheet && node.props.title === "Eliminar ejercicio").props.onConfirm(),
      };
    } finally { options.vnode = previous; }
  }

  it("the main confirmation submits deletion through the shared action", async () => {
    actions().open();
    actions().confirm();
    expect(mutate).toHaveBeenCalledTimes(1);
    await mutations[1].mutationFn();
    expect(apiFetch).toHaveBeenCalledWith("DELETE", "/sessions/1/exercises/4");
  });

  it("rechecks logged sets before deleting", async () => {
    actions().open();
    actions({ planned_id: 4, name: "Press", performed_sets: [{ set_number: 1 }] });
    await expect(async () => mutations[1].mutationFn()).rejects.toThrow("series registradas");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("plan picker interactions", () => {
  it("explicitly clears unilateral when replacing unilateral strength with cardio", async () => {
    const props = { mode: "replace", exercise: { planned_id: 4, activity_type: "strength", unilateral: true, sets: 2, performed_sets: [] } };
    picker(props).choose("Cardio");
    await picker(props).save();
    expect(apiFetch).toHaveBeenCalledWith("PUT", "/sessions/1/exercises/4", {
      new_exercise_id: 10, target_sets: 2, execution_metric: "duration_minutes", unilateral: false,
      target_reps: null, target_duration_minutes: 20, target_duration_seconds: null,
      suggested_weight: null,
      set_targets: [
        { set_number: 1, weight: null, duration_minutes: 20 },
        { set_number: 2, weight: null, duration_minutes: 20 },
      ],
    });
  });

  it("does not reset unilateral when replacing with strength", async () => {
    const props = { mode: "replace", exercise: { planned_id: 4, activity_type: "strength", unilateral: true, performed_sets: [] } };
    picker(props).choose("Plank");
    await picker(props).save();
    expect(apiFetch).toHaveBeenCalledWith("PUT", "/sessions/1/exercises/4", expect.objectContaining({ new_exercise_id: 20 }));
    expect(vi.mocked(apiFetch).mock.lastCall?.[2]).not.toHaveProperty("unilateral");
  });

  it("resets minutes and all drafts when cardio changes to strength", () => {
    picker().choose("Cardio");
    expect(picker().input("Minutos para todas las series")?.value).toBe("20");
    picker().choose("Plank");
    expect(picker().input("Reps para todas las series")?.value).toBe("10");
    expect(picker().input("Minutos para todas las series")).toBeUndefined();
    picker().toggle("Por tiempo", true);
    expect(picker().input("Segundos para todas las series")?.value).toBe("30");
  });

  it.each(["add", "replace"])("%s sends individual targets through the real picker save", async (mode) => {
    const props = { mode, exercise: mode === "replace" ? { planned_id: 4 } : undefined };
    picker(props).choose("Plank");
    picker(props).input("Series").onInput({ target: { value: "2" } });
    picker(props).input("Peso para todas las series (kg)").onInput({ target: { value: "12,5" } });
    picker(props).toggle("Personalizar por serie", true);
    expect(picker(props).input("Peso serie 1 (kg)").value).toBe("12,5");
    picker(props).input("Peso serie 2 (kg)").onInput({ target: { value: "15" } });
    picker(props).input("Reps serie 2").onInput({ target: { value: "8" } });
    await picker(props).save();
    expect(apiFetch).toHaveBeenCalledWith(mode === "add" ? "POST" : "PUT", mode === "add" ? "/sessions/1/exercises" : "/sessions/1/exercises/4", expect.objectContaining({
      [mode === "add" ? "exercise_id" : "new_exercise_id"]: 20,
      execution_metric: "reps", target_sets: 2,
      set_targets: [{ set_number: 1, weight: 12.5, reps: 10 }, { set_number: 2, weight: 15, reps: 8 }],
    }));
  });

  it("returns to common targets and resets customization on another selection", async () => {
    picker().choose("Plank");
    picker().toggle("Personalizar por serie", true);
    picker().input("Peso serie 1 (kg)").onInput({ target: { value: "25" } });
    picker().toggle("Personalizar por serie", false);
    await picker().save();
    expect(vi.mocked(apiFetch).mock.lastCall?.[2]).toMatchObject({ set_targets: [
      { weight: null, unloaded: true, reps: 10 }, { weight: null, unloaded: true, reps: 10 }, { weight: null, unloaded: true, reps: 10 },
    ] });
    picker().toggle("Personalizar por serie", true);
    picker().choose("Cardio");
    expect(picker().input("Minutos para todas las series").value).toBe("20");
    expect(picker().input("Peso serie 1 (kg)")).toBeUndefined();
  });

  it("hides kg for bodyweight and serializes null, never zero", async () => {
    picker().choose("Flexiones");
    expect(picker().input("Peso para todas las series (kg)")).toBeUndefined();
    await picker().save();
    expect(vi.mocked(apiFetch).mock.lastCall?.[2]).toMatchObject({
      suggested_weight: null,
      set_targets: [
        { weight: null, unloaded: true }, { weight: null, unloaded: true }, { weight: null, unloaded: true },
      ],
    });
  });

  it.each(["readonly", "completed", "journal", "logged"])("rechecks %s before replacing from an open picker", async (reason) => {
    const props = { mode: "replace", exercise: { planned_id: 4, performed_sets: [] as any[] }, planStatus: "in_progress" };
    picker(props).choose("Plank");
    access.readOnly = reason === "readonly";
    access.pending = reason === "journal" ? [{ sessionId: 1 }] : [];
    if (reason === "logged") props.exercise.performed_sets = [{ set_number: 1 }];
    if (reason === "completed") props.planStatus = "completed";
    await expect(async () => picker(props).save()).rejects.toThrow();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});