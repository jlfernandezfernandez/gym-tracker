import { h } from "preact";
import render from "preact-render-to-string";
import { afterEach, describe, expect, it, vi } from "vitest";

const setQueryData = vi.fn();
const openSession = vi.fn();
const push = vi.fn();
const seenKeys: string[] = [];
let activePrescription: Record<string, unknown> = {};
let activeTarget: Record<string, unknown> | undefined;

afterEach(() => {
  activePrescription = {};
  activeTarget = undefined;
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[0];
    seenKeys.push(String(key));
    if (key === "profile") {
      return { data: { name: "Jordi" }, isLoading: false };
    }
    if (key === "active") {
      return {
        isLoading: false,
        data: {
          session: {
            id: 11,
            title: "Grip",
            planned_exercises: [
              {
                id: 7,
                order: 0,
                exercise_id: 30,
                target_sets: 3,
                target_reps: null,
                target_duration_seconds: 40,
                suggested_weight: 32.5,
                execution_metric: "duration_seconds",
                status: "in_progress",
                performed_sets: [
                  { set_number: 1, duration_seconds: 50, weight: 32.5 },
                  { set_number: 3, duration_seconds: 45, weight: 35 },
                ],
                set_targets: [
                  { set_number: 2, duration_seconds: 55, weight: 34 },
                ],
                exercise: { name: "Farmer Carry", activity_type: "strength" },
                ...activePrescription,
              },
            ],
          },
          current: {
            current_planned_exercise_id: 7,
            current_set_number: 2,
            current_exercise_name: "Farmer Carry",
            next_set_target: activeTarget ?? {
              set_number: 2,
              duration_seconds: 55,
              weight: 36,
            },
            completed_sets: 2,
            total_sets: 3,
          },
        },
      };
    }
    if (key === "session-activity") {
      return {
        data: [{ id: 11, session_date: "2026-09-07", duration_actual: 45 }],
        isLoading: false,
      };
    }
    return { data: [], isLoading: false };
  },
  useQueryClient: () => ({ setQueryData }),
}));

vi.mock("../../app/App", () => ({
  useApp: () => ({ openSession, push }),
}));

vi.mock("../../lib/telegram", () => ({ haptic: () => undefined }));

vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));

vi.mock("../../components/feedback", () => ({
  Empty: ({ children }: any) => h("div", null, children),
  Stat: ({ label, value }: any) => h("div", null, `${label}:${value}`),
}));

vi.mock("../../components/visualizations", () => ({
  Heatmap: () => null,
  SetProgress: ({ ariaLabel }: { ariaLabel: string }) =>
    h("div", { "data-aria": ariaLabel }, ariaLabel),
}));

import { Home } from "./Home";

describe("Home", () => {
  it.each([
    [{ weight: null, unloaded: true }, false],
    [{ unloaded: true }, false],
    [{ weight: null }, true],
    [{}, true],
  ])("resolves the next weight after a previous 50 load: %j", (weightFields, inherits) => {
    activeTarget = { set_number: 2, reps: 12, ...weightFields };
    activePrescription = {
      execution_metric: "reps", target_reps: 10, target_duration_seconds: null,
      suggested_weight: 30, weight_mode: "weighted",
      performed_sets: [{ set_number: 1, weight: 50, reps: 10 }],
      set_targets: [activeTarget],
    };
    const html = render(h(Home, {}));
    expect(html).toContain("Reps:12");
    expect(html.includes("50 kg")).toBe(inherits);
    expect(html).not.toContain("30 kg");
  });

  it("shows the real current set and seconds target for timed strength", () => {
    seenKeys.length = 0;
    const html = render(h(Home, {}));

    expect(html).toContain("Serie 2 de 3");
    expect(html).toContain("Serie sugerida");
    expect(html).toContain("Segundos:55");
    expect(html).not.toContain("Reps:");
    expect(seenKeys).toContain("session-activity");
    expect(seenKeys).not.toContain("sessions");
  });
});
