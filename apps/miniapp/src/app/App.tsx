/** App island: query client, session source and a tiny stack router. */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createContext } from 'preact';
import { useContext, useMemo, useState } from 'preact/hooks';
import { apiFetch } from '../lib/api';
import { normalizeSession } from '../lib/helpers';
import { inTelegram } from '../lib/telegram';
import { Empty } from '../components/ui';
import { History } from '../features/history/History';
import { Profile } from '../features/profile/Profile';
import { RecordDetail } from '../features/records/RecordDetail';
import { Records } from '../features/records/Records';
import { Exercise } from '../features/workout/Exercise';
import { Home } from '../features/workout/Home';
import { Plan } from '../features/workout/Plan';

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
  const view = activeView as any;
  const screens: Record<string, any> = {
    landing: <Home />,
    plan: <Plan />,
    exercise: <Exercise plannedId={view.plannedId} />,
    history: <History />,
    records: <Records />,
    recordDetail: <RecordDetail exerciseId={view.exerciseId} title={view.title} />,
    profile: <Profile />,
  };
  return <AppContext.Provider value={appContext}>{screens[activeView.name]}</AppContext.Provider>;
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
