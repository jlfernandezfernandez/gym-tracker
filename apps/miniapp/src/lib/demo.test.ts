import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoFetch } from './demo';

describe('demoFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  describe('planned prescription corrections', () => {
    beforeEach(async () => { await demoFetch('POST', '/demo/reset'); });
    afterEach(async () => { await demoFetch('POST', '/demo/reset'); });

    it.each([{}, { weight: null }, { weight: 35 }, { weight: null, unloaded: true }, { unloaded: true }])('preserves per-set weight semantics through edits and current state: %j', async (weightFields) => {
      await demoFetch('POST', '/sessions/900/exercises/9001/sets', { set_number: 3, weight: 70, reps: 8 });
      const updated = await demoFetch('PUT', '/sessions/900/exercises/9002', {
        suggested_weight: 50,
        set_targets: [1, 2].map((set_number) => ({ set_number, reps: 12, ...weightFields })),
      });
      const target = updated.planned_exercises.find((exercise: any) => exercise.id === 9002).set_targets[0];
      expect(Object.hasOwn(target, 'weight')).toBe(Object.hasOwn(weightFields, 'weight'));
      const unloaded = 'unloaded' in weightFields && weightFields.unloaded;
      const initialWeight = unloaded ? null : weightFields.weight ?? 50;
      expect((await demoFetch('GET', '/sessions/900/current')).next_set_target.weight).toBe(initialWeight);
      await demoFetch('PUT', '/sessions/900/exercises/9002', { suggested_weight: 60 });
      await demoFetch('POST', '/sessions/900/exercises/9002/sets', { set_number: 1, weight: 40, reps: 10 });
      const current = (await demoFetch('GET', '/sessions/900/current')).next_set_target;
      expect(current.weight).toBe(unloaded ? null : weightFields.weight ?? 40);
      expect(current.unloaded).toBe(unloaded ? true : undefined);
      const stored = (await demoFetch('GET', '/sessions/900')).planned_exercises.find((exercise: any) => exercise.id === 9002).set_targets[1];
      expect(Object.hasOwn(stored, 'weight')).toBe(Object.hasOwn(weightFields, 'weight'));
      expect(stored.weight).toBe(weightFields.weight);
      expect(stored.unloaded).toBe(unloaded ? true : undefined);
    });

    it.each([{}, { weight: null }, { weight: null, unloaded: true }, { unloaded: true }])('preserves weight presence when adding targets: %j', async (weightFields) => {
      const updated = await demoFetch('POST', '/sessions/900/exercises', {
        exercise_id: 102, target_sets: 1, target_reps: 10, suggested_weight: 50,
        set_targets: [{ set_number: 1, reps: 12, ...weightFields }],
      });
      const target = updated.planned_exercises.at(-1).set_targets[0];
      expect(Object.hasOwn(target, 'weight')).toBe(Object.hasOwn(weightFields, 'weight'));
      expect(target.weight).toBe(weightFields.weight);
      expect(target.unloaded).toBe('unloaded' in weightFields ? weightFields.unloaded : undefined);
    });

    it.each(['POST', 'PUT'])('rejects contradictory unloaded weight without mutations via %s', async (method) => {
      const before = await demoFetch('GET', '/sessions/900');
      const path = method === 'POST' ? '/sessions/900/exercises' : '/sessions/900/exercises/9002';
      await expect(demoFetch(method, path, {
        exercise_id: 102, target_reps: 10,
        set_targets: [{ set_number: 1, reps: 10, weight: 35, unloaded: true }],
      })).rejects.toMatchObject({ status: 422, message: expect.stringContaining('unloaded') });
      expect(await demoFetch('GET', '/sessions/900')).toEqual(before);
    });

    it('rejects unloaded cardio targets', async () => {
      const [cardio] = await demoFetch('GET', '/exercises?activity_type=cardio');
      await expect(demoFetch('POST', '/sessions/900/exercises', {
        exercise_id: cardio.id, execution_metric: 'duration_minutes', target_duration_minutes: 20,
        set_targets: [{ set_number: 1, duration_minutes: 20, unloaded: true }],
      })).rejects.toMatchObject({ status: 422, message: expect.stringContaining('unloaded') });
    });

    it.each([false, true])('rejects metric changes with logged sets without changing history (timed=%s)', async (timed) => {
      if (timed) {
        await demoFetch('PUT', '/sessions/900/exercises/9002', {
          execution_metric: 'duration_seconds', target_duration_seconds: 40,
        });
      }
      await demoFetch('POST', '/sessions/900/exercises/9002/sets', {
        set_number: 1, weight: 62.5, ...(timed ? { duration_seconds: 40 } : { reps: 10 }),
      });
      const before = await demoFetch('GET', '/sessions/900');
      const progress = await demoFetch('GET', '/exercises/102/progress');

      await expect(demoFetch('PUT', '/sessions/900/exercises/9002', {
        execution_metric: timed ? 'reps' : 'duration_seconds',
        ...(timed ? { target_reps: 12 } : { target_duration_seconds: 35 }),
        notes: 'must not persist',
      })).rejects.toMatchObject({ status: 422, message: expect.stringContaining('logged sets') });

      expect(await demoFetch('GET', '/sessions/900')).toEqual(before);
      expect(await demoFetch('GET', '/exercises/102/progress')).toEqual(progress);
    });

    it.each([
      { label: 'omitted', prescription: {} },
      { label: 'null', prescription: { set_targets: null } },
      { label: 'empty', prescription: { set_targets: [] } },
    ])('replaces row targets with curl globals when set_targets is $label', async ({ prescription }) => {
      const catalog = await demoFetch('GET', '/exercises?search=curl');
      const curl = catalog[0];
      expect(curl).toBeDefined();
      const updated = await demoFetch('PUT', '/sessions/900/exercises/9002', {
        new_exercise_id: curl.id, suggested_weight: 15, target_reps: 12, ...prescription,
      });
      const changed = updated.planned_exercises.find((exercise: any) => exercise.id === 9002);
      expect(changed).toMatchObject({ exercise_id: curl.id, suggested_weight: 15, target_reps: 12 });
      expect(changed.set_targets).toHaveLength(changed.target_sets);
      for (const target of changed.set_targets) {
        expect(target).toMatchObject({ weight: 15, reps: 12 });
      }
      expect(await demoFetch('GET', '/sessions/900')).toEqual(updated);
      await demoFetch('POST', '/sessions/900/exercises/9001/sets', {
        set_number: 3, weight: 70, reps: 8,
      });
      expect(await demoFetch('GET', '/sessions/900/current')).toMatchObject({
        current_planned_exercise_id: 9002,
        next_set_target: { weight: 15, reps: 12 },
      });
    });
  });

  describe('planned prescription compatibility', () => {
    beforeEach(async () => { await demoFetch('POST', '/demo/reset'); });
    afterEach(async () => { await demoFetch('POST', '/demo/reset'); });

    it('preserves explicit set targets over replacement globals', async () => {
      const [curl] = await demoFetch('GET', '/exercises?search=curl');
      const updated = await demoFetch('PUT', '/sessions/900/exercises/9002', {
        new_exercise_id: curl.id, suggested_weight: 15, target_reps: 12,
        set_targets: [{ set_number: 1, weight: 10, reps: 8, is_warmup: true }],
      });
      const changed = updated.planned_exercises.find((exercise: any) => exercise.id === 9002);
      expect(changed).toMatchObject({ suggested_weight: 15, target_reps: 12 });
      expect(changed.set_targets[0]).toMatchObject({ weight: 10, reps: 8, is_warmup: true });
      expect(changed.set_targets[1]).toMatchObject({ weight: 15, reps: 12 });
    });

    it('preserves global prescription and plan fields on an id-only replacement', async () => {
      const [curl] = await demoFetch('GET', '/exercises?search=curl');
      const initial = await demoFetch('PUT', '/sessions/900/exercises/9002', {
        notes: 'keep notes', superset_group: 'A', unilateral: true,
        set_targets: [{ set_number: 1, weight: 30, reps: 15 }],
      });
      const before = initial.planned_exercises.find((exercise: any) => exercise.id === 9002);
      const updated = await demoFetch('PUT', '/sessions/900/exercises/9002', { new_exercise_id: curl.id });
      const changed = updated.planned_exercises.find((exercise: any) => exercise.id === 9002);
      expect(changed).toMatchObject({
        exercise_id: curl.id, suggested_weight: 62.5, target_reps: 10,
        target_sets: before.target_sets, notes: 'keep notes', superset_group: 'A', unilateral: true,
      });
      for (const target of changed.set_targets) {
        expect(target).toMatchObject({ weight: 62.5, reps: 10 });
      }
    });

    it('allows same-metric edits without changing logged sets or per-set targets', async () => {
      const initial = await demoFetch('GET', '/sessions/900');
      const before = initial.planned_exercises.find((exercise: any) => exercise.id === 9001);
      const updated = await demoFetch('PUT', '/sessions/900/exercises/9001', {
        execution_metric: 'reps', target_reps: 12, suggested_weight: 72.5,
      });
      const changed = updated.planned_exercises.find((exercise: any) => exercise.id === 9001);
      expect(changed).toMatchObject({ target_reps: 12, suggested_weight: 72.5 });
      expect(changed.performed_sets).toEqual(before.performed_sets);
      expect(changed.set_targets).toEqual(before.set_targets);
    });
  });

  describe('session completion and cardio targets', () => {
    beforeEach(async () => { await demoFetch('POST', '/demo/reset'); });
    afterEach(async () => { await demoFetch('POST', '/demo/reset'); });

    it('finishes only after the last target set and removes the session from active', async () => {
      const initial = await demoFetch('GET', '/sessions/900');
      let updated = initial;

      for (const exercise of initial.planned_exercises) {
        for (let setNumber = exercise.performed_sets.length + 1; setNumber <= exercise.target_sets; setNumber++) {
          expect(updated.status).toBe('in_progress');
          expect(await demoFetch('GET', '/sessions/active')).toMatchObject({
            session: { id: 900, status: 'in_progress' },
          });
          updated = await demoFetch('POST', `/sessions/900/exercises/${exercise.id}/sets`, {
            set_number: setNumber,
            weight: exercise.suggested_weight,
            reps: exercise.target_reps,
            duration_minutes: exercise.target_duration_minutes,
            duration_seconds: exercise.target_duration_seconds,
          });
        }
      }

      expect(updated.planned_exercises.map((exercise: any) => exercise.status)).toEqual([
        'completed', 'completed', 'completed', 'completed',
      ]);
      expect(updated.status).toBe('completed');
      expect(await demoFetch('GET', '/sessions/900')).toMatchObject({ status: 'completed' });
      expect(await demoFetch('GET', '/sessions/900/current')).toMatchObject({
        session_status: 'completed', is_complete: true, current_planned_exercise_id: null,
      });
      expect(await demoFetch('GET', '/sessions/active')).toBeNull();
    });

    it('counts skipped exercises as done when logging the last remaining set', async () => {
      for (const plannedId of [9002, 9003, 9004]) {
        await demoFetch('PUT', `/sessions/900/exercises/${plannedId}`, { status: 'skipped' });
      }

      expect(await demoFetch('GET', '/sessions/900')).toMatchObject({ status: 'in_progress' });
      const updated = await demoFetch('POST', '/sessions/900/exercises/9001/sets', {
        set_number: 3, weight: 70, reps: 8,
      });

      expect(updated.planned_exercises.map((exercise: any) => exercise.status)).toEqual([
        'completed', 'skipped', 'skipped', 'skipped',
      ]);
      expect(updated.status).toBe('completed');
      expect(await demoFetch('GET', '/sessions/active')).toBeNull();
    });

    it.each([
      { label: 'omitted', prescription: {}, expectedDuration: null, expectedSetDuration: null },
      { label: 'null', prescription: { target_duration_minutes: null }, expectedDuration: null, expectedSetDuration: null },
      { label: 'explicit', prescription: { target_duration_minutes: 12 }, expectedDuration: 12, expectedSetDuration: 12 },
      { label: 'per-set only', prescription: { set_targets: [{ set_number: 1, duration_minutes: 7 }] }, expectedDuration: null, expectedSetDuration: 7 },
    ])('preserves $label cardio duration without inventing a global target', async ({ prescription, expectedDuration, expectedSetDuration }) => {
      const updated = await demoFetch('POST', '/sessions/900/exercises', {
        exercise_id: 107, target_sets: 1, ...prescription,
      });
      const added = updated.planned_exercises.at(-1);

      expect(added).toMatchObject({
        execution_metric: 'duration_minutes',
        target_duration_minutes: expectedDuration,
        target_reps: null,
        target_duration_seconds: null,
        set_targets: [{ set_number: 1, duration_minutes: expectedSetDuration, reps: null, duration_seconds: null }],
      });
      const stored = await demoFetch('GET', '/sessions/900');
      expect(stored.planned_exercises.at(-1)).toEqual(added);
    });
  });

  it('serves a fictitious athlete with an active session and history', async () => {
    const profile = await demoFetch('GET', '/profile');
    const active = await demoFetch('GET', '/sessions/active');
    const sessions = await demoFetch('GET', '/sessions');
    const catalog = await demoFetch('GET', '/exercises?limit=50&offset=0');

    expect(profile.name).toBe('Álex');
    expect(active.session.status).toBe('in_progress');
    expect(sessions.some((session: any) => session.status === 'completed')).toBe(true);
    expect(catalog.map((exercise: any) => exercise.name)).toContain('Press banca');
  });

  it('serves independent JSON data when structuredClone is unavailable', async () => {
    vi.stubGlobal('structuredClone', undefined);

    const first = await demoFetch('GET', '/profile');
    first.name = 'Mutated';
    const second = await demoFetch('GET', '/profile');

    expect(second.name).toBe('Álex');
  });

  it('supports in-memory workout mutations and reset without leaking state', async () => {
    const before = await demoFetch('GET', '/sessions/900/current');

    await demoFetch('POST', '/sessions/900/exercises/9001/sets', {
      set_number: 3,
      weight: 70,
      reps: 8,
    });

    const afterAdvance = await demoFetch('GET', '/sessions/900/current');
    expect(afterAdvance.current_planned_exercise_id).toBe(9002);
    expect(afterAdvance.current_set_number).toBe(1);

    await demoFetch('POST', '/sessions/900/exercises/9002/sets', {
      set_number: 1,
      weight: 62.5,
      reps: 10,
    });

    const afterLog = await demoFetch('GET', '/sessions/900/current');
    expect(afterLog.current_planned_exercise_id).toBe(9002);
    expect(afterLog.current_set_number).toBe(2);
    expect(afterLog.next_set_target).toMatchObject({ set_number: 2, reps: 10, weight: 62.5 });

    await demoFetch('POST', '/demo/reset');

    const reset = await demoFetch('GET', '/sessions/900/current');
    expect(reset).toEqual(before);
  });

  it('aligns current session shape with the API contract even when the session is completed', async () => {
    const current = await demoFetch('GET', '/sessions/901/current');

    expect(current).toMatchObject({
      session_id: 901,
      session_status: 'completed',
      current_planned_exercise_id: null,
      current_exercise_id: null,
      current_set_number: null,
      target_sets: null,
      execution_metric: null,
      target_reps: null,
      target_duration_minutes: null,
      target_duration_seconds: null,
      suggested_weight: null,
      weight_mode: null,
      activity_type: null,
      next_set_target: null,
      exercise_order: null,
      is_complete: true,
    });
    expect(current.exercise_count).toBeGreaterThan(0);
    expect(current.completed_exercises).toBe(current.exercise_count);
  });

  it('allows correcting a completed set and preserves aggregated history', async () => {
    const completedBefore = await demoFetch('GET', '/sessions/901');
    const originalWeight = completedBefore.planned_exercises[0].performed_sets[0].weight;

    const updated = await demoFetch('PATCH', '/sessions/901/exercises/9010/sets/90101', {
      weight: 92.5,
      reps: 8,
      is_warmup: false,
      notes: 'ajuste demo',
      sensation: 'ok',
      rir: 1,
      rpe: 9,
    });

    expect(updated.planned_exercises[0].performed_sets[0].weight).toBe(92.5);

    const progress = await demoFetch('GET', '/exercises/103/progress?limit=50');
    expect(progress.at(-1)?.top_weight || progress[progress.length - 1]?.top_weight).toBeGreaterThanOrEqual(92.5);

    await demoFetch('POST', '/demo/reset');
    const completedReset = await demoFetch('GET', '/sessions/901');
    expect(completedReset.planned_exercises[0].performed_sets[0].weight).toBe(originalWeight);
  });

  it('rejects replacing an exercise when the new catalog id does not exist and keeps state unchanged', async () => {
    const before = await demoFetch('GET', '/sessions/900');

    await expect(
      demoFetch('PUT', '/sessions/900/exercises/9001', { new_exercise_id: 999999 }),
    ).rejects.toMatchObject({ status: 404, message: expect.stringContaining('Exercise not found') });

    const after = await demoFetch('GET', '/sessions/900');
    expect(after).toEqual(before);
  });

  it('rejects deleting an exercise that already has performed sets', async () => {
    const before = await demoFetch('GET', '/sessions/900');

    await expect(demoFetch('DELETE', '/sessions/900/exercises/9001')).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('logged sets'),
    });

    const after = await demoFetch('GET', '/sessions/900');
    expect(after).toEqual(before);
  });

  it('requires reorder payloads to contain each planned exercise id exactly once', async () => {
    const before = await demoFetch('GET', '/sessions/900');

    await expect(
      demoFetch('PUT', '/sessions/900/exercises/reorder', { planned_exercise_ids: [9002, 9002, 9003] }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('exactly once') });

    const after = await demoFetch('GET', '/sessions/900');
    expect(after).toEqual(before);
  });

  it('clears incompatible global targets when switching execution metric', async () => {
    const updated = await demoFetch('PUT', '/sessions/900/exercises/9002', {
      execution_metric: 'duration_seconds',
      target_duration_seconds: 35,
      suggested_weight: 30,
    });

    const changed = updated.planned_exercises.find((exercise: any) => exercise.id === 9002);
    expect(changed.execution_metric).toBe('duration_seconds');
    expect(changed.target_reps).toBeNull();
    expect(changed.target_duration_minutes).toBeNull();
    expect(changed.target_duration_seconds).toBe(35);
    expect(changed.set_targets.every((target: any) => target.reps == null && target.duration_minutes == null && target.duration_seconds === 35)).toBe(true);
  });

  it('rejects incompatible set_targets on execution metric changes without mutating the exercise', async () => {
    const before = await demoFetch('GET', '/sessions/900');

    await expect(
      demoFetch('PUT', '/sessions/900/exercises/9002', {
        execution_metric: 'duration_seconds',
        target_duration_seconds: 35,
        set_targets: [{ set_number: 1, weight: 30, reps: 10 }],
      }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining('set_targets') });

    const after = await demoFetch('GET', '/sessions/900');
    expect(after).toEqual(before);
  });

  it('sorts same-day exercise progress by ascending session_id', async () => {
    const firstRepeat = await demoFetch('POST', '/sessions/902/repeat');
    const secondRepeat = await demoFetch('POST', '/sessions/902/repeat');

    for (const repeated of [firstRepeat, secondRepeat]) {
      await demoFetch('POST', `/sessions/${repeated.id}/exercises/${repeated.planned_exercises[0].id}/sets`, {
        set_number: 1,
        weight: 67.5,
        reps: 10,
      });
      await demoFetch('POST', `/sessions/${repeated.id}/finish`, { energy: 7, feedback: '' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const progress = await demoFetch('GET', '/exercises/101/progress?limit=50');
    const sameDayIds = progress
      .filter((point: any) => point.date === today)
      .map((point: any) => point.session_id);

    expect(sameDayIds).toEqual([...sameDayIds].sort((first, second) => first - second));
  });

  it('handles profile, measurement and dislike mutations entirely in memory', async () => {
    await demoFetch('PATCH', '/profile', { goal: 'Fuerza', weight_kg: 77.1 });
    const updatedProfile = await demoFetch('GET', '/profile');
    expect(updatedProfile.goal).toBe('Fuerza');
    expect(updatedProfile.weight_kg).toBe(77.1);

    await demoFetch('POST', '/profile/measurements', {
      measured_at: '2026-09-07T12:00:00',
      source: 'manual',
      weight_kg: 77.1,
      notes: 'demo',
    });
    const measurementList = await demoFetch('GET', '/profile/measurements?limit=8');
    expect(measurementList).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'manual', weight_kg: 77.1, notes: 'demo' }),
    ]));

    await demoFetch('POST', '/disliked-exercises', { exercise_id: 102 });
    expect(await demoFetch('GET', '/disliked-exercises')).toEqual([
      expect.objectContaining({ exercise_id: 102 }),
    ]);

    await demoFetch('DELETE', '/disliked-exercises/102');
    expect(await demoFetch('GET', '/disliked-exercises')).toEqual([]);
  });

  it('rejects unknown routes after demo reset endpoint and no longer behaves as read-only', async () => {
    await expect(demoFetch('GET', '/not-a-demo-route')).rejects.toThrow('no disponible');
  });
});
