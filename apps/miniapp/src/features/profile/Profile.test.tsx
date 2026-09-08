import { h, options, type VNode } from 'preact';
import render from 'preact-render-to-string';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmSheet } from '../../components/sheet';
import { apiFetch } from '../../lib/api';
import { Profile } from './Profile';

const harness = vi.hoisted(() => ({
  state: [] as unknown[], cursor: 0, readOnly: false,
  pending: Promise.resolve(), invalidate: vi.fn(),
}));

vi.mock('preact/hooks', async (importOriginal) => {
  const original = await importOriginal<typeof import('preact/hooks')>();
  return {
    ...original,
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.state)) harness.state[index] = typeof initial === 'function' ? initial() : initial;
      return [harness.state[index], (next: any) => {
        harness.state[index] = typeof next === 'function' ? next(harness.state[index]) : next;
      }];
    },
  };
});
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: any) => ({
    data: queryKey[0] === 'profile' ? { name: 'Atleta', onboarding_complete: true } : queryKey[0] === 'measurements' ? [] : null,
    isLoading: false,
  }),
  useQueryClient: () => ({ invalidateQueries: harness.invalidate, setQueryData: vi.fn() }),
  useMutation: (callbacks: any) => ({
    isPending: false,
    mutate: () => {
      harness.pending = Promise.resolve().then(callbacks.mutationFn).then(callbacks.onSuccess, callbacks.onError);
    },
    reset: vi.fn(),
  }),
}));
vi.mock('../../app/App', () => ({ useApp: () => ({ readOnly: harness.readOnly }) }));
vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }));
vi.mock('../../lib/helpers', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/helpers')>(), showToast: vi.fn(),
}));

let nodes: VNode<any>[] = [];
function view() {
  harness.cursor = 0;
  nodes = [];
  const previous = options.vnode;
  options.vnode = (node) => { previous?.(node); nodes.push(node); };
  try { return render(h(Profile, {})); }
  finally { options.vnode = previous; }
}
function button(label: string) {
  const node = nodes.find((node) => node.type === 'button' && render(node).replace(/<[^>]+>/g, '').trim() === label);
  expect(node, `button ${label}`).toBeDefined();
  return node!;
}
function input(id: string) {
  const node = nodes.find((node) => node.props.id === id);
  expect(node, `input ${id}`).toBeDefined();
  return node!;
}
function enter(id: string, value: string) {
  input(id).props.onInput({ target: { value } });
  return view();
}
function toggle(key: string, checked = true) {
  input(`select-${key}`).props.onChange({ currentTarget: { checked } });
  return view();
}
function open() {
  view();
  button('Añadir medición').props.onClick();
  return view();
}
async function save() {
  const sheet = nodes.find((node) => node.type === ConfirmSheet);
  expect(sheet).toBeDefined();
  sheet!.props.onConfirm();
  await harness.pending;
  return view();
}

beforeEach(() => {
  harness.state = [];
  harness.readOnly = false;
  harness.invalidate.mockClear();
  vi.mocked(apiFetch).mockReset().mockResolvedValue({ id: 1 });
  vi.stubGlobal('__APP_VERSION__', 'test');
});

afterEach(() => vi.unstubAllGlobals());

describe('Profile measurement sheet', () => {
  it('starts with an add button and no permanent measurement form', () => {
    const html = view();
    expect(html).toContain('Añadir medición');
    expect(html).not.toContain('measurement-date');
    expect(html).not.toContain('<dialog');
  });

  it('opens the existing sheet with five checkboxes and only selected value inputs', () => {
    let html = open();
    expect(nodes.find((node) => node.type === ConfirmSheet)?.props.open).toBe(true);
    expect(html.match(/type="checkbox"/g)).toHaveLength(5);
    expect(html).not.toContain('id="measurement-weight_kg"');
    expect(html).not.toContain('measurement-source');
    html = toggle('weight_kg');
    html = toggle('body_fat_pct');
    expect(html).toContain('id="measurement-weight_kg"');
    expect(html).toContain('id="measurement-body_fat_pct"');
    expect(html).not.toContain('id="measurement-muscle_kg"');
    expect(html).toContain('measurement-date');
    expect(html).toContain('measurement-notes');
    html = toggle('weight_kg', false);
    expect(html).not.toContain('id="measurement-weight_kg"');
  });

  it('rejects an empty selection without writing', async () => {
    open();
    const html = await save();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(html).toContain('role="alert"');
    expect(html).toContain('Añade al menos una medición');
  });

  it.each(['', ' ', 'abc', '-1', 'Infinity', '1,2,3'])('rejects invalid selected value %j and preserves the sheet', async (value) => {
    open();
    toggle('weight_kg');
    enter('measurement-weight_kg', value);
    const html = await save();
    expect(apiFetch).not.toHaveBeenCalled();
    expect(html).toContain('role="alert"');
    expect(html).toContain('<dialog');
    expect(input('measurement-weight_kg').props.value).toBe(value);
  });

  it('requires a date before writing', async () => {
    open();
    toggle('weight_kg');
    enter('measurement-weight_kg', '72,25');
    enter('measurement-date', '');
    expect(await save()).toContain('Elige una fecha');
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('cancels without writing or invalidating', () => {
    open();
    toggle('muscle_kg');
    enter('measurement-muscle_kg', '30,25');
    button('Cancelar').props.onClick();
    expect(view()).not.toContain('<dialog');
    expect(apiFetch).not.toHaveBeenCalled();
    expect(harness.invalidate).not.toHaveBeenCalled();
  });

  it('preserves the draft on API error, then sends only selected measures and closes on success', async () => {
    open();
    toggle('weight_kg');
    enter('measurement-weight_kg', '72,25');
    toggle('muscle_kg');
    enter('measurement-muscle_kg', 'abc');
    toggle('muscle_kg', false);
    toggle('body_fat_pct');
    enter('measurement-body_fat_pct', '0');
    enter('measurement-date', '2026-09-08');
    enter('measurement-notes', 'En ayunas');
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Sin conexión'));
    expect(await save()).toContain('Sin conexión');
    expect(input('measurement-weight_kg').props.value).toBe('72,25');
    expect(input('measurement-date').props.value).toBe('2026-09-08');
    expect(input('measurement-notes').props.value).toBe('En ayunas');
    expect(input('select-weight_kg').props.checked).toBe(true);
    expect(harness.invalidate).not.toHaveBeenCalled();
    expect(await save()).not.toContain('<dialog');
    expect(apiFetch).toHaveBeenLastCalledWith('POST', '/profile/measurements', {
      measured_at: '2026-09-08T12:00:00', source: 'manual', notes: 'En ayunas', weight_kg: 72.25, body_fat_pct: 0,
    });
    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: ['measurements'] });
    expect(harness.invalidate).toHaveBeenCalledWith({ queryKey: ['profile'] });
    open();
    expect(input('select-weight_kg').props.checked).toBe(false);
    expect(input('measurement-notes').props.value).toBe('');
  });

  it('does not expose the add action in read-only mode', () => {
    harness.readOnly = true;
    const html = view();
    expect(html).not.toContain('Añadir medición');
    expect(html).not.toContain('<dialog');
  });
});