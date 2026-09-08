import { useMutation } from "@tanstack/react-query";
import { h, options } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import render from "preact-render-to-string";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api";

vi.mock("preact/hooks", async (importOriginal) => {
  const hooks = await importOriginal<typeof import("preact/hooks")>();
  return {
    ...hooks,
    useEffect: vi.fn(hooks.useEffect),
    useRef: vi.fn(hooks.useRef),
    useState: vi.fn(hooks.useState),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useQuery: vi.fn(),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
  }),
}));
vi.mock("../../app/App", () => ({
  useApp: () => ({ readOnly: false, pop: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../lib/telegram", () => ({ haptic: () => undefined }));
vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));

import {
  formatTimerDisplay,
  isTimedOrIsometricExercise,
  IsometricTimer,
  LogSetForm,
  progressSummaryText,
  SetRow,
  targetValue,
} from "./Exercise";

afterEach(() => {
  vi.mocked(useState).mockReset();
  vi.mocked(useRef).mockReset();
  vi.mocked(useEffect).mockReset();
  vi.mocked(useMutation).mockClear();
  vi.mocked(apiFetch).mockClear();
});

const storedSet = {
  id: 1,
  set_number: 1,
  weight: 60,
  reps: 10,
  is_warmup: false,
  rir: 3,
  notes: "Stored notes",
  sensation: "Stored sensation",
};

function renderSetEditor(
  props: Partial<Parameters<typeof SetRow>[0]> = {},
  previous = { identity: "1:2:1:strength:false", open: true },
  open = true,
  draftSource = storedSet,
) {
  const fields: any[] = [
    open,
    "72.5",
    "9",
    true,
    2,
    "Local notes",
    "Local sensation",
    draftSource,
  ];
  fields.forEach((value, index) => {
    vi.mocked(useState).mockReturnValueOnce([
      value,
      (next: any) => {
        fields[index] = next;
      },
    ]);
  });
  vi.mocked(useRef).mockReturnValueOnce({ current: previous });
  let synchronize: (() => void) | undefined;
  vi.mocked(useEffect).mockImplementationOnce((effect) => {
    synchronize = effect;
  });
  let reload: (() => void) | undefined;
  const previousVNode = options.vnode;
  options.vnode = (vnode) => {
    previousVNode?.(vnode);
    if (
      vnode.type === "button" &&
      vnode.props["aria-label"] === "Recargar valores guardados"
    ) {
      reload = (vnode.props as any).onClick;
    }
  };
  try {
    const html = render(
      h(SetRow, {
        set: { ...storedSet },
        target: { reps: 10, weight: 60 },
        sessionId: 1,
        plannedId: 2,
        exerciseId: 3,
        activityType: "strength",
        ...props,
      }),
    );
    return { html, fields, synchronize: () => synchronize?.(), reload };
  } finally {
    options.vnode = previousVNode;
  }
}

function renderForm(exercise: Record<string, unknown>) {
  return render(
    h(LogSetForm, {
      sessionId: 1,
      exercise: {
        planned_id: 2,
        exercise_id: 3,
        performed_sets: [],
        set_targets: [],
        weight_mode: "weighted",
        ...exercise,
      },
      nextSetNumber: 1,
      remainingSetCount: 1,
      onShowPicker: () => undefined,
    }),
  );
}

describe("isTimedOrIsometricExercise", () => {
  it.each([
    [{ weight: null, unloaded: true }, ""],
    [{ unloaded: true }, ""],
    [{ weight: null }, "50"],
    [{}, "50"],
  ])("resolves the next weight after a previous 50 load: %j", (weightFields, expected) => {
    const html = render(h(LogSetForm, {
      sessionId: 1,
      exercise: {
        planned_id: 2, exercise_id: 3, activity_type: "strength", execution_metric: "reps",
        weight_mode: "weighted", weight: 30, reps: 10,
        performed_sets: [{ set_number: 1, weight: 50, reps: 10 }],
        set_targets: [{ set_number: 2, reps: 12, ...weightFields }],
      },
      nextSetNumber: 2, remainingSetCount: 1, onShowPicker: () => undefined,
    }));
    if (expected) {
      expect(html).toMatch(/<input\b(?=[^>]*id="set-weight")(?=[^>]*value="50")[^>]*>/);
    } else {
      expect(html).toMatch(/<input\b(?=[^>]*id="set-weight")(?=[^>]*\svalue(?:="")?(?=[\s/>]))[^>]*>/);
    }
    expect(html).toMatch(/<input\b(?=[^>]*id="set-reps")(?=[^>]*value="12")[^>]*>/);
  });

  it("does not inherit common weight when the individual set explicitly has no load", () => {
    const html = renderForm({
      activity_type: "strength", execution_metric: "reps", weight: 50, reps: 10,
      set_targets: [{ set_number: 1, weight: null, unloaded: true, reps: 12 }],
    });
    expect(html).toMatch(/<input\b(?=[^>]*id="set-weight")(?=[^>]*\svalue(?:="")?(?=[\s/>]))[^>]*>/);
    expect(html).toMatch(/<input\b(?=[^>]*id="set-reps")(?=[^>]*value="12")[^>]*>/);
  });

  it("detects only the explicit timed contract", () => {
    expect(
      isTimedOrIsometricExercise({ execution_metric: "duration_seconds" }),
    ).toBe(true);
    expect(isTimedOrIsometricExercise({ duration_seconds: 45 })).toBe(true);
    expect(isTimedOrIsometricExercise({ target_duration_seconds: 30 })).toBe(
      true,
    );
  });

  it("does not infer timed mode from names or cues", () => {
    expect(isTimedOrIsometricExercise({ name: "Plancha abdominal" })).toBe(
      false,
    );
    expect(isTimedOrIsometricExercise({ name_en: "Plank hold" })).toBe(false);
    expect(
      isTimedOrIsometricExercise({ notes: "Aguantar 45s en isometría" }),
    ).toBe(false);
    expect(
      isTimedOrIsometricExercise({ instructions: "Hold for 30 seconds" }),
    ).toBe(false);
    expect(
      isTimedOrIsometricExercise({
        name: "Press banca",
        activity_type: "strength",
      }),
    ).toBe(false);
    expect(
      isTimedOrIsometricExercise({
        name: "Sentadilla con barra",
        activity_type: "strength",
      }),
    ).toBe(false);
    expect(
      isTimedOrIsometricExercise({
        name: "Dominadas",
        activity_type: "strength",
      }),
    ).toBe(false);
    expect(
      isTimedOrIsometricExercise({
        name: "Cinta de correr",
        activity_type: "cardio",
      }),
    ).toBe(false);
    expect(isTimedOrIsometricExercise(null)).toBe(false);
    expect(isTimedOrIsometricExercise(undefined)).toBe(false);
  });
});

describe("formatTimerDisplay", () => {
  it("formats seconds into MM:SS format", () => {
    expect(formatTimerDisplay(0)).toBe("00:00");
    expect(formatTimerDisplay(5)).toBe("00:05");
    expect(formatTimerDisplay(45)).toBe("00:45");
    expect(formatTimerDisplay(60)).toBe("01:00");
    expect(formatTimerDisplay(90)).toBe("01:30");
    expect(formatTimerDisplay(125)).toBe("02:05");
  });

  it("handles negative or decimal inputs safely", () => {
    expect(formatTimerDisplay(-10)).toBe("00:00");
    expect(formatTimerDisplay(45.8)).toBe("00:45");
  });
});

describe("targetValue formatting", () => {
  it("formats cardio duration in minutes", () => {
    expect(
      targetValue({ duration_minutes: 20 }, { activity_type: "cardio" }),
    ).toBe("20 min");
  });

  it("formats regular strength sets with weight and reps", () => {
    expect(
      targetValue(
        { reps: 10, weight: 80 },
        { activity_type: "strength", weight_mode: "weighted" },
      ),
    ).toBe("80 kg × 10");
    expect(
      targetValue(
        { reps: 12 },
        { activity_type: "strength", weight_mode: "bodyweight" },
      ),
    ).toBe("Peso corporal × 12");
  });

  it("formats isometric sets with seconds (s)", () => {
    expect(
      targetValue(
        { duration_seconds: 45 },
        { execution_metric: "duration_seconds", weight_mode: "bodyweight" },
      ),
    ).toBe("Peso corporal × 45s");
    expect(
      targetValue(
        { duration_seconds: 60, weight: 15 },
        { execution_metric: "duration_seconds", weight_mode: "weighted" },
      ),
    ).toBe("15 kg × 60s");
    expect(
      targetValue(
        { duration_seconds: 30 },
        { execution_metric: "duration_seconds", weight_mode: "unloaded" },
      ),
    ).toBe("30s");
  });
});

describe("progressSummaryText", () => {
  it("describes timed strength progress in seconds, not reps", () => {
    expect(progressSummaryText("seconds")).toBe(
      "Duración máxima en segundos por sesión",
    );
  });
});

describe("IsometricTimer component", () => {
  it("renders interactive controls and display in idle state", () => {
    const html = render(
      h(IsometricTimer, {
        targetSeconds: 45,
        onFinish: vi.fn(),
        onStopEarly: vi.fn(),
        onAdjustTime: vi.fn(),
      }),
    );

    expect(html).toContain("Cronómetro isométrico");
    expect(html).toContain("00:45");
    expect(html).toContain("Objetivo: 45s");
    expect(html).toContain("Iniciar");
    expect(html).toContain("+10s");
    expect(html).toContain("+30s");
  });
});

describe("SetRow draft synchronization", () => {
  it("preserves the draft on an RPE-only refetch until explicit remote reload", () => {
    const draftSource = { ...storedSet, rpe: 8, rir: 2 };
    const remoteSet = { ...draftSource, rpe: 9 };
    const editor = renderSetEditor(
      { set: remoteSet },
      undefined,
      true,
      draftSource,
    );
    editor.synchronize();

    expect(editor.fields.slice(1, 7)).toEqual([
      "72.5",
      "9",
      true,
      2,
      "Local notes",
      "Local sensation",
    ]);
    expect(editor.fields[7]).toBe(draftSource);
    expect(editor.html).toContain("La serie ha cambiado");
    expect(editor.reload).toBeTypeOf("function");

    editor.reload!();

    expect(editor.fields.slice(1, 7)).toEqual([
      "60",
      "10",
      false,
      2,
      "Stored notes",
      "Stored sensation",
    ]);
    expect(editor.fields[7]).toBe(remoteSet);
  });

  it.each([false, true])(
    "preserves all draft fields on refetch (remote changes: %s)",
    (changed) => {
      const editor = renderSetEditor({
        set: { ...storedSet, weight: changed ? 65 : 60 },
      });
      editor.synchronize();

      expect(editor.fields.slice(1, 7)).toEqual([
        "72.5",
        "9",
        true,
        2,
        "Local notes",
        "Local sensation",
      ]);
      expect(Boolean(editor.reload)).toBe(changed);
    },
  );

  it.each([
    { identity: "1:2:1:strength:false", open: false },
    { identity: "1:2:9:strength:false", open: true },
    { identity: "1:9:1:strength:false", open: true },
    { identity: "9:2:1:strength:false", open: true },
  ])(
    "initializes current values on opening or identity change: %j",
    (previous) => {
      const editor = renderSetEditor({}, previous);
      editor.synchronize();

      expect(editor.fields.slice(1, 7)).toEqual([
        "60",
        "10",
        false,
        3,
        "Stored notes",
        "Stored sensation",
      ]);
    },
  );

  it("refreshes a closed editor from the latest set", () => {
    const editor = renderSetEditor({}, undefined, false);
    editor.synchronize();

    expect(editor.fields.slice(1, 7)).toEqual([
      "60",
      "10",
      false,
      3,
      "Stored notes",
      "Stored sensation",
    ]);
  });

  it("reloads remote values only after an explicit action", () => {
    const remoteSet = { ...storedSet, weight: 65, notes: "Remote notes" };
    const editor = renderSetEditor({ set: remoteSet });
    editor.synchronize();

    expect(editor.html).toContain("La serie ha cambiado");
    expect(editor.fields[1]).toBe("72.5");
    expect(editor.reload).toBeTypeOf("function");
    editor.reload?.();

    expect(editor.fields.slice(1, 7)).toEqual([
      "65",
      "10",
      false,
      3,
      "Remote notes",
      "Stored sensation",
    ]);
    expect(editor.fields[7]).toEqual(remoteSet);
  });

  it("saves the local draft after a remote update", async () => {
    const editor = renderSetEditor({ set: { ...storedSet, weight: 65 } });
    editor.synchronize();
    const correction = vi.mocked(useMutation).mock.calls[0][0] as any;
    await correction.mutationFn();

    expect(apiFetch).toHaveBeenCalledWith(
      "PATCH",
      "/sessions/1/exercises/2/sets/1",
      {
        weight: 72.5,
        reps: 9,
        is_warmup: true,
        rir: 2,
        rpe: 8,
        notes: "Local notes",
        sensation: "Local sensation",
      },
    );
  });
});

describe("SetRow component rendering", () => {
  it("renders cardio row with duration in minutes", () => {
    const html = render(
      h(SetRow, {
        set: { id: 1, set_number: 1, duration_minutes: 20, is_warmup: false },
        target: { set_number: 1, duration_minutes: 20 },
        sessionId: 1,
        plannedId: 2,
        exerciseId: 3,
        activityType: "cardio",
      }),
    );
    expect(html).toContain("20 min");
  });

  it("renders regular strength row with weight and reps", () => {
    const html = render(
      h(SetRow, {
        set: {
          id: 1,
          set_number: 1,
          reps: 10,
          weight: 60,
          weight_mode: "weighted",
          is_warmup: false,
        },
        target: { set_number: 1, reps: 10, weight: 60 },
        sessionId: 1,
        plannedId: 2,
        exerciseId: 3,
        activityType: "strength",
      }),
    );
    expect(html).toContain("60 kg × 10");
  });

  it("renders isometric row with seconds (s)", () => {
    const html = render(
      h(SetRow, {
        set: {
          id: 1,
          set_number: 1,
          duration_seconds: 45,
          weight_mode: "bodyweight",
          is_warmup: false,
        },
        target: { set_number: 1, duration_seconds: 45 },
        sessionId: 1,
        plannedId: 2,
        exerciseId: 3,
        activityType: "strength",
        isTimed: true,
      }),
    );
    expect(html).toContain("45s");
  });
});

describe("LogSetForm exercise metrics and isometric support", () => {
  it("shows only minutes for cardio", () => {
    const html = renderForm({
      activity_type: "cardio",
      duration_minutes: 20,
      reps: null,
      weight: null,
      weight_mode: null,
    });

    expect(html).toContain("Minutos");
    expect(html).not.toContain("Peso (kg)");
    expect(html).not.toContain(">Reps<");
    expect(html).not.toContain("Cronómetro isométrico");
    expect(html).toContain("20 min");
  });

  it("keeps weight and reps for dynamic strength", () => {
    const html = renderForm({
      name: "Press banca",
      activity_type: "strength",
      reps: 10,
      weight: 40,
    });

    expect(html).toContain("Peso (kg)");
    expect(html).toContain(">Reps<");
    expect(html).not.toContain("Segundos (s)");
    expect(html).not.toContain("Cronómetro isométrico");
    expect(html).not.toContain("Minutos");
  });

  it("embeds live isometric stopwatch and countdown timer for timed exercises", () => {
    const html = renderForm({
      activity_type: "strength",
      execution_metric: "duration_seconds",
      weight_mode: "bodyweight",
      duration_seconds: 45,
      target_duration_seconds: 45,
    });

    expect(html).toContain("Segundos (s)");
    expect(html).toContain('value="45"');
    expect(html).toContain("Cronómetro isométrico");
    expect(html).toContain("00:45");
    expect(html).toContain("Iniciar");
    expect(html).toContain("+10s");
    expect(html).toContain("+30s");
    expect(html).not.toContain("Minutos");
  });

  it('embeds live isometric stopwatch for explicit execution_metric="duration_seconds"', () => {
    const html = renderForm({
      name: "Dead Hang",
      activity_type: "strength",
      execution_metric: "duration_seconds",
      weight_mode: "bodyweight",
      duration_seconds: 30,
    });

    expect(html).toContain("Segundos (s)");
    expect(html).toContain("Cronómetro isométrico");
    expect(html).toContain("00:30");
    expect(html).toContain("Iniciar");
  });

  it("prefills target seconds from previous set or set targets", () => {
    const html = render(
      h(LogSetForm, {
        sessionId: 1,
        exercise: {
          planned_id: 2,
          exercise_id: 3,
          name: "Wall sit",
          activity_type: "strength",
          execution_metric: "duration_seconds",
          weight_mode: "bodyweight",
          performed_sets: [{ set_number: 1, duration_seconds: 50 }],
          set_targets: [{ set_number: 2, duration_seconds: 55 }],
        },
        nextSetNumber: 2,
        remainingSetCount: 1,
        onShowPicker: () => undefined,
      }),
    );

    expect(html).toContain("Segundos (s)");
    expect(html).toContain('value="55"');
    expect(html).toContain("00:55");
  });
});
