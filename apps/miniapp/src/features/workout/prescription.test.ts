import { describe, expect, it } from "vitest";
import * as prescription from "./prescription";

describe("catalog selection defaults", () => {
  it("resets cardio minutes to reps for any strength selection, without name heuristics", () => {
    expect(prescription.selectionDefaults({ activity_type: "cardio" })).toEqual({ metric: "duration_minutes", value: "20", weight: "" });
    expect(prescription.selectionDefaults({ activity_type: "strength", name: "Plank" })).toEqual({ metric: "reps", value: "10", weight: "" });
  });
});

describe("prescription payload", () => {
  const draft = { sets: "2", metric: "reps" as const, value: "10", weight: "12,5", targets: null };
  const strength = { activity_type: "strength", equipment: "dumbbell" };

  it("applies common weight and reps to every set", () => {
    expect(prescription.serializePrescription(strength, draft)).toEqual({
      target_sets: 2, execution_metric: "reps", target_reps: 10,
      target_duration_minutes: null, target_duration_seconds: null, suggested_weight: 12.5,
      set_targets: [{ set_number: 1, weight: 12.5, reps: 10 }, { set_number: 2, weight: 12.5, reps: 10 }],
    });
  });

  it("serializes distinct set weights and reps", () => {
    expect(prescription.serializePrescription(strength, { ...draft, targets: [
      { weight: "10", value: "12" }, { weight: "15", value: "8" },
    ] }).set_targets).toEqual([
      { set_number: 1, weight: 10, reps: 12 }, { set_number: 2, weight: 15, reps: 8 },
    ]);
  });

  it("serializes explicit seconds and null bodyweight per set", () => {
    const payload = prescription.serializePrescription({ ...strength, equipment: "body weight" }, {
      ...draft, metric: "duration_seconds", weight: "", targets: [
        { weight: "", value: "30" }, { weight: "", value: "45" },
      ],
    });
    expect(payload.execution_metric).toBe("duration_seconds");
    expect(payload.target_reps).toBeNull();
    expect(payload.suggested_weight).toBeNull();
    expect(payload.set_targets).toEqual([
      { set_number: 1, weight: null, unloaded: true, duration_seconds: 30 }, { set_number: 2, weight: null, unloaded: true, duration_seconds: 45 },
    ]);
  });

  it('marks only intentionally blank strength set weights', () => {
    const payload = prescription.serializePrescription(strength, { ...draft, targets: [
      { weight: '50', value: '10' }, { weight: ' ', value: '12' },
    ] });
    expect(payload.suggested_weight).toBe(50);
    expect(payload.set_targets).toEqual([
      { set_number: 1, weight: 50, reps: 10 },
      { set_number: 2, weight: null, unloaded: true, reps: 12 },
    ]);
  });

  it("forces cardio minutes and clears inherited strength unilateral, weight and metrics", () => {
    const payload = prescription.serializePrescription({ activity_type: "cardio" }, {
      ...draft, targets: [{ weight: "100", value: "5" }, { weight: "50", value: "7" }],
    });
    expect(payload).toEqual({
      target_sets: 2, execution_metric: "duration_minutes", unilateral: false,
      target_reps: null, target_duration_minutes: 5, target_duration_seconds: null,
      suggested_weight: null,
      set_targets: [
        { set_number: 1, weight: null, duration_minutes: 5 }, { set_number: 2, weight: null, duration_minutes: 7 },
      ],
    });
  });

  it.each(["reps", "duration_seconds"] as const)("omits unilateral for strength with %s to preserve the existing setting", (metric) => {
    const payload = prescription.serializePrescription(strength, { ...draft, metric });
    expect(payload).not.toHaveProperty("unilateral");
  });

  it.each(["0", "-2", "abc", "Infinity", "12kg"])('rejects invalid weight %s in common and individual targets', (weight) => {
    expect(() => prescription.serializePrescription(strength, { ...draft, weight })).toThrow();
    expect(() => prescription.serializePrescription(strength, { ...draft, targets: [
      { weight, value: "10" }, { weight: "20", value: "10" },
    ] })).toThrow();
  });

  it("rejects load for equipment whose existing contract excludes kg", () => {
    expect(() => prescription.serializePrescription({ ...strength, equipment: "band" }, draft)).toThrow();
  });

  it.each(["", "0", "-1", "1.5", "abc"])('rejects invalid set metric %s', (value) => {
    expect(() => prescription.serializePrescription(strength, { ...draft, value })).toThrow();
  });

  it("rejects an incomplete personalized prescription", () => {
    expect(() => prescription.serializePrescription(strength, { ...draft, targets: [{ weight: "", value: "10" }] })).toThrow();
  });
});