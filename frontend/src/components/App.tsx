/** App island: query client, session source and a tiny stack router. */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createContext } from 'preact';
import { useContext, useMemo, useState } from 'preact/hooks';
import { apiFetch } from '../lib/api';
import { normalize } from '../lib/helpers';
import { inTelegram } from '../lib/telegram';
import { Empty } from './ui';
import { Landing } from './screens/Landing';
import { Plan } from './screens/Plan';
import { Exercise } from './screens/Exercise';
import { History } from './screens/History';
import { Records } from './screens/Records';
import { RecordDetail } from './screens/RecordDetail';
import { Profile } from './screens/Profile';

export type View =
  | { name: 'landing' }
  | { name: 'plan' }
  | { name: 'exercise'; plannedId: number }
  | { name: 'history' }
  | { name: 'records' }
  | { name: 'recordDetail'; exerciseId: number; title: string }
  | { name: 'profile' };

interface AppCtxValue {
  push: (v: View) => void;
  pop: () => void;
  /** Point the plan/exercise screens at a session and navigate to the plan. */
  openSession: (id: number) => void;
  sessionId?: number;
  shareToken?: string;
  readOnly: boolean;
}

const AppCtx = createContext<AppCtxValue>(null as any);
export const useApp = () => useContext(AppCtx);

/** Session for the currently open plan (by id, or by share token for companions). */
export function useSession() {
  const { sessionId, shareToken } = useApp();
  return useQuery({
    queryKey: shareToken ? ['session', 'share', shareToken] : ['session', sessionId],
    queryFn: () =>
      shareToken
        ? apiFetch('GET', '/sessions/share/' + encodeURIComponent(shareToken))
        : apiFetch('GET', '/sessions/' + sessionId),
    enabled: !!(shareToken || sessionId),
    select: normalize,
  });
}

/** Derived current-exercise state; skipped on read-only share views. */
export function useCurrent(sessionId?: number) {
  const { readOnly } = useApp();
  return useQuery({
    queryKey: ['current', sessionId],
    queryFn: () => apiFetch('GET', `/sessions/${sessionId}/current`),
    enabled: !!sessionId && !readOnly,
  });
}

function routeParams() {
  const p: Record<string, string> = {};
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  // /session/share/:token[/exercise/:plannedExerciseId]
  if (parts[0] === 'session' && parts[1] === 'share' && parts[2]) {
    p.share_token = parts[2];
    if (parts[3] === 'exercise' && parts[4]) p.exercise_id = parts[4];
  }
  return p;
}

function Router() {
  const route = useMemo(routeParams, []);
  const shareToken = route.share_token;
  const readOnly = !!shareToken && !inTelegram();

  const [stack, setStack] = useState<View[]>(() => {
    if (shareToken) {
      const base: View[] = [{ name: 'plan' }];
      if (route.exercise_id) base.push({ name: 'exercise', plannedId: Number(route.exercise_id) });
      return base;
    }
    return [{ name: 'landing' }];
  });
  const [sessionId, setSessionId] = useState<number>();

  const ctx: AppCtxValue = {
    push: (v) => setStack((s) => [...s, v]),
    pop: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    openSession: (id) => {
      setSessionId(id);
      setStack((s) => [...s, { name: 'plan' }]);
    },
    sessionId,
    shareToken,
    readOnly,
  };

  if (!shareToken && !inTelegram() && location.hostname !== 'localhost') {
    return (
      <Empty icon="📱">
        Esta app vive dentro de Telegram.
        <br />
        Ábrela desde el chat con tu coach.
      </Empty>
    );
  }

  const view = stack[stack.length - 1];
  return (
    <AppCtx.Provider value={ctx}>
      {view.name === 'landing' && <Landing />}
      {view.name === 'plan' && <Plan />}
      {view.name === 'exercise' && <Exercise plannedId={view.plannedId} />}
      {view.name === 'history' && <History />}
      {view.name === 'records' && <Records />}
      {view.name === 'recordDetail' && <RecordDetail exerciseId={view.exerciseId} title={view.title} />}
      {view.name === 'profile' && <Profile />}
    </AppCtx.Provider>
  );
}

export default function App() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Router />
    </QueryClientProvider>
  );
}
