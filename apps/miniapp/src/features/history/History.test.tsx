import { h } from 'preact';
import render from 'preact-render-to-string';
import { describe, expect, it, vi } from 'vitest';

const openSession = vi.fn();
const seenKeys: string[] = [];

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey.join(':');
    seenKeys.push(key);
    if (queryKey[0] === 'session-activity') {
      return {
        data: [{ id: 9, session_date: '2026-09-05', duration_actual: 52, total_volume: 3200 }],
        isLoading: false,
      };
    }
    if (queryKey[0] === 'sessions' && queryKey[1] === 'history') {
      return {
        data: [{ id: 8, session_date: '2026-09-04', title: 'Empuje', exercise_count: 5, total_sets: 16, duration_actual: 48 }],
        isLoading: false,
      };
    }
    return { data: [], isLoading: false };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

vi.mock('../../app/App', () => ({
  useApp: () => ({ openSession }),
}));

vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../components/feedback', () => ({
  Empty: ({ children }: any) => h('div', null, children),
  Loading: () => h('div', null, 'loading'),
}));

vi.mock('../../components/navigation', () => ({
  TopBar: ({ title }: any) => h('div', null, title),
}));

vi.mock('../../components/visualizations', () => ({
  Heatmap: ({ sessions }: any) => h('div', { 'data-testid': 'heatmap-count' }, String(sessions.length)),
}));

import { History, buildHistoryPath, mergeHistoryPage } from './History';

describe('History', () => {
  it('uses separate activity and paginated history queries', () => {
    seenKeys.length = 0;
    const html = render(h(History, {}));

    expect(html).toContain('data-testid="heatmap-count"');
    expect(html).toContain('>1<');
    expect(html).toContain('Empuje');
    expect(seenKeys).toContain('session-activity');
    expect(seenKeys).toContain('sessions:history:0');
  });

  it('builds an on_date history request instead of relying on a representative session id', () => {
    expect(buildHistoryPath({ pageSize: 20, offset: 0, selectedDate: '2026-09-05' })).toBe(
      '/sessions?limit=20&offset=0&completed_only=true&on_date=2026-09-05',
    );
  });

  it('replaces a refetched page and deduplicates ids across offsets', () => {
    const afterFirstPage = mergeHistoryPage({}, 0, [
      { id: 9, session_date: '2026-09-05' },
      { id: 8, session_date: '2026-09-04' },
    ]);

    const withSecondPage = mergeHistoryPage(afterFirstPage.pages, 20, [
      { id: 8, session_date: '2026-09-04' },
      { id: 7, session_date: '2026-09-03' },
    ]);

    expect(withSecondPage.sessions.map((session: any) => session.id)).toEqual([9, 8, 7]);

    const refetchedFirstPage = mergeHistoryPage(withSecondPage.pages, 0, [
      { id: 12, session_date: '2026-09-06' },
      { id: 8, session_date: '2026-09-04' },
    ]);

    expect(refetchedFirstPage.sessions.map((session: any) => session.id)).toEqual([12, 8, 7]);
  });
});