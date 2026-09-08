export type PrescriptionMetric = "reps" | "duration_minutes" | "duration_seconds";
export type TargetDraft = { weight: string; value: string };

export function usesBodyweight(exercise: any): boolean {
  return exercise?.weight_mode === "bodyweight" || new Set([
    "body weight", "band", "resistance band", "rope", "roller",
    "wheel roller", "stability ball", "bosu ball",
  ]).has(exercise?.equipment);
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Introduce un objetivo entero mayor que cero");
  }
  return parsed;
}

function targetWeight(value: string, exercise: any): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value.trim().replace(",", "."));
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value.trim()) || !Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("El peso debe ser mayor que 0 o quedar vacio");
  }
  if (usesBodyweight(exercise)) throw new Error("Este ejercicio no admite carga en kg");
  return parsed;
}

export function serializePrescription(exercise: any, draft: {
  sets: string;
  metric: PrescriptionMetric;
  value: string;
  weight: string;
  targets: TargetDraft[] | null;
}) {
  const count = positiveInteger(draft.sets);
  if (count > 20) throw new Error("El maximo es 20 series");
  const metric = exercise.activity_type === "cardio" ? "duration_minutes" : draft.metric;
  if (exercise.activity_type !== "cardio" && metric === "duration_minutes") {
    throw new Error("Fuerza requiere repeticiones o segundos");
  }
  const targets = draft.targets ?? Array.from({ length: count }, () => ({ weight: draft.weight, value: draft.value }));
  if (targets.length !== count) throw new Error("Completa el objetivo de cada serie");
  const setTargets = targets.map((target, index) => ({
    set_number: index + 1,
    weight: metric === "duration_minutes" ? null : targetWeight(target.weight, exercise),
    ...(metric !== "duration_minutes" && target.weight.trim() === "" ? { unloaded: true } : {}),
    [metric]: positiveInteger(target.value),
  }));
  const firstValue = positiveInteger(targets[0].value);
  return {
    target_sets: count,
    execution_metric: metric,
    ...(exercise.activity_type === "cardio" ? { unilateral: false } : {}),
    target_reps: metric === "reps" ? firstValue : null,
    target_duration_minutes: metric === "duration_minutes" ? firstValue : null,
    target_duration_seconds: metric === "duration_seconds" ? firstValue : null,
    suggested_weight: setTargets[0].weight,
    set_targets: setTargets,
  };
}

export function selectionDefaults(exercise: any): {
  metric: PrescriptionMetric;
  value: string;
  weight: string;
} {
  return exercise.activity_type === "cardio"
    ? { metric: "duration_minutes", value: "20", weight: "" }
    : { metric: "reps", value: "10", weight: "" };
}