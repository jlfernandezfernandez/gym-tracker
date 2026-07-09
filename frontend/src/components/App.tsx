/** App island: query client, session source and a tiny stack router. */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createContext } from 'preact';
import { useContext, useMemo, useState } from 'preact/hooks';
import { apiFetch } from '../lib/api';
import { normalizeSession } from '../lib/helpers';
import { inTelegram } from '../lib/telegram';
import { Empty } from './ui';
import { Landing } from './screens/Landing';
import { Plan } from './screens/Plan';
import { Exercise } from './screens/Exercise';
import { History } from './screens/History';
import { Records } from './screens/Records';
import { RecordDetail } from './screens/RecordDetail';
import { Profile } from './screens/Profile';

type View =
  | { name: 'landing' }
  | { name: 'plan' }
  | { name: 'exercise'; plannedId: number }
  | { name: 'history' }
  | { name: 'records' }
  | { name: 'recordDetail'; exerciseId: number; title: string }
  | { name: 'profile' };

interface AppContextValue {
  push: (view: View) => void;
  pop: () => void;
  /** Point the plan/exercise screens at a session and navigate to the plan. */
  openSession: (sessionId: number) => void;
  sessionId?: number;
  shareToken?: string;
  readOnly: boolean;
}

const AppContext = createContext<AppContextValue>(null as any);
export const useApp = () => useContext(AppContext);

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
    select: normalizeSession,
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

function shareRouteParams() {
  const params: Record<string, string> = {};
  const pathSegments = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  // /session/share/:token[/exercise/:plannedExerciseId]
  if (pathSegments[0] === 'session' && pathSegments[1] === 'share' && pathSegments[2]) {
    params.share_token = pathSegments[2];
    if (pathSegments[3] === 'exercise' && pathSegments[4]) params.exercise_id = pathSegments[4];
  }
  return params;
}

function Router() {
  const route = useMemo(shareRouteParams, []);
  const shareToken = route.share_token;
  const readOnly = !!shareToken && !inTelegram();

  const [viewStack, setViewStack] = useState<View[]>(() => {
    if (shareToken) {
      const initialStack: View[] = [{ name: 'plan' }];
      if (route.exercise_id) initialStack.push({ name: 'exercise', plannedId: Number(route.exercise_id) });
      return initialStack;
    }
    return [{ name: 'landing' }];
  });
  const [sessionId, setSessionId] = useState<number>();

  const appContext: AppContextValue = {
    push: (view) => setViewStack((stack) => [...stack, view]),
    pop: () => setViewStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack)),
    openSession: (id) => {
      setSessionId(id);
      setViewStack((stack) => [...stack, { name: 'plan' }]);
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

  const activeView = viewStack[viewStack.length - 1];
  return (
    <AppContext.Provider value={appContext}>
      {activeView.name === 'landing' && <Landing />}
      {activeView.name === 'plan' && <Plan />}
      {activeView.name === 'exercise' && <Exercise plannedId={activeView.plannedId} />}
      {activeView.name === 'history' && <History />}
      {activeView.name === 'records' && <Records />}
      {activeView.name === 'recordDetail' && <RecordDetail exerciseId={activeView.exerciseId} title={activeView.title} />}
      {activeView.name === 'profile' && <Profile />}
    </AppContext.Provider>
  );
}

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  );
}
