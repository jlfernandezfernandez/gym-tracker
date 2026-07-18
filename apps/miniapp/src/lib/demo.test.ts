import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoFetch } from './demo';

describe('demoFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it('blocks mutations and unknown routes', async () => {
    await expect(demoFetch('POST', '/sessions/900/exercises/1/sets')).rejects.toThrow('solo lectura');
    await expect(demoFetch('GET', '/not-a-demo-route')).rejects.toThrow('no disponible');
  });
});
