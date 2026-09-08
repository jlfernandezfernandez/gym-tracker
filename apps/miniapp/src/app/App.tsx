/** App island: query client, session source and a tiny stack router. */
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { RotateCcw } from "lucide-preact";
import { createContext, Fragment } from "preact";
import { useContext, useMemo, useRef, useState } from "preact/hooks";
import { apiFetch } from "../lib/api";
import { PendingWrites, useWorkoutSync } from "./WorkoutSync";
import { isDemoMode } from "../lib/demo";
import { normalizeSession } from "../lib/helpers";
import { inTelegram } from "../lib/telegram";
import { parseLaunchRoute } from "./routes";
import { Empty } from "../components/feedback";
import { TabBar } from "../components/navigation";
import { Catalog } from "../features/catalog/Catalog";
import { CatalogExercise } from "../features/catalog/CatalogExercise";
import { History } from "../features/history/History";
import { Profile } from "../features/profile/Profile";
import { RecordDetail } from "../features/records/RecordDetail";
import { Records } from "../features/records/Records";
import { Exercise } from "../features/workout/Exercise";
import { Home } from "../features/workout/Home";
import { Plan } from "../features/workout/Plan";

type View =
  | { name: "landing" }
  | { name: "plan" }
  | { name: "exercise"; plannedId: number }
  | { name: "catalog" }
  | { name: "catalogExercise"; exerciseId: number }
  | { name: "history" }
  | { name: "records" }
  | { name: "recordDetail"; exerciseId: number; title: string }
  | { name: "profile" };

interface AppContextValue {
  push: (view: View) => void;
  pop: () => void;
  replace: (view: View) => void;
  /** Point the plan/exercise screens at a session and navigate to the plan. */
  openSession: (sessionId: number) => void;
  sessionId?: number;
  shareToken?: string;
  readOnly: boolean;
  demoMode: boolean;
  selectTab: (name: string) => void;
  workoutSync?: ReturnType<typeof useWorkoutSync>;
}

const AppContext = createContext<AppContextValue>(null as any);
export const useApp = () => useContext(AppContext);

/** Session for the currently open plan (by id, or by share token for companions). */
export function useSession() {
  const { sessionId, shareToken, workoutSync } = useApp();
  const journal = workoutSync?.journal;
  let cached: any;
  try {
    cached = sessionId ? journal?.read().sessions[sessionId] : undefined;
  } catch {}
  return useQuery({
    queryKey: shareToken
      ? ["session", "share", shareToken]
      : ["session", sessionId],
    queryFn: async () => {
      const session = await (shareToken
        ? apiFetch("GET", "/sessions/share/" + encodeURIComponent(shareToken))
        : apiFetch("GET", "/sessions/" + sessionId));
      if (!shareToken && journal) {
        try {
          await journal.remember(session);
        } catch (error: any) {
          workoutSync?.setError(error.message);
        }
      }
      return session;
    },
    initialData: cached,
    initialDataUpdatedAt: 0,
    enabled: !!(shareToken || sessionId),
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: shareToken
      ? false
      : (query) => {
          const session = query.state.data as any;
          const isVisible =
            typeof document === "undefined" ||
            document.visibilityState === "visible";
          return session &&
            ["planned", "in_progress"].includes(session.status) &&
            isVisible
            ? 15000
            : false;
        },
    refetchIntervalInBackground: false,
    select: (session: any) => {
      try {
        return normalizeSession(
          sessionId && journal ? journal.view(sessionId, session) : session,
        );
      } catch {
        return normalizeSession(session);
      }
    },
  });
}

/** Derived current-exercise state; skipped on read-only share views. */
export function useCurrent(sessionId?: number, sessionStatus?: string) {
  const { readOnly } = useApp();
  return useQuery({
    queryKey: ["current", sessionId],
    queryFn: () => apiFetch("GET", `/sessions/${sessionId}/current`),
    enabled: !!sessionId && !readOnly,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval:
      !sessionId || readOnly
        ? false
        : () => {
            const isVisible =
              typeof document === "undefined" ||
              document.visibilityState === "visible";
            return isVisible &&
              ["planned", "in_progress"].includes(String(sessionStatus || ""))
              ? 15000
              : false;
          },
    refetchIntervalInBackground: false,
  });
}

function Router() {
  const route = useMemo(() => parseLaunchRoute(location.pathname), []);
  const demoMode = isDemoMode();
  const shareToken = route.shareToken;
  const readOnly = route.readOnly;
  const workoutSync = useWorkoutSync(readOnly || demoMode);
  const restoredId = workoutSync.state?.activeId;
  const queryClient = useQueryClient();
  const resetPending = useRef(false);
  const [demoReset, setDemoReset] = useState({
    pending: false,
    error: "",
    revision: 0,
  });

  const [viewStack, setViewStack] = useState<View[]>(() => {
    if (shareToken) {
      const initialStack: View[] = [{ name: "plan" }];
      if (route.plannedExerciseId)
        initialStack.push({
          name: "exercise",
          plannedId: route.plannedExerciseId,
        });
      return initialStack;
    }
    if (route.sessionId) {
      const initialStack: View[] = [{ name: "plan" }];
      if (route.plannedExerciseId)
        initialStack.push({
          name: "exercise",
          plannedId: route.plannedExerciseId,
        });
      return initialStack;
    }
    return restoredId
      ? [{ name: "landing" }, { name: "plan" }]
      : [{ name: "landing" }];
  });
  const [sessionId, setSessionId] = useState<number | undefined>(
    route.sessionId ?? restoredId,
  );

  const resetDemo = async () => {
    if (!demoMode || readOnly || resetPending.current) return;
    resetPending.current = true;
    setDemoReset((state) => ({ ...state, pending: true, error: "" }));
    try {
      await queryClient.cancelQueries();
      await apiFetch("POST", "/demo/reset");
      queryClient.clear();
      setSessionId(undefined);
      setViewStack([{ name: "landing" }]);
      setDemoReset((state) => ({
        pending: false,
        error: "",
        revision: state.revision + 1,
      }));
    } catch (error) {
      setDemoReset((state) => ({
        ...state,
        pending: false,
        error: error instanceof Error ? error.message : "No se pudo reiniciar la demo.",
      }));
    } finally {
      resetPending.current = false;
    }
  };

  const appContext: AppContextValue = {
    push: (view) => setViewStack((stack) => [...stack, view]),
    pop: () =>
      setViewStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack)),
    replace: (view) => setViewStack((stack) => [...stack.slice(0, -1), view]),
    openSession: (id) => {
      setSessionId(id);
      setViewStack((stack) => [...stack, { name: "plan" }]);
    },
    sessionId,
    workoutSync,
    shareToken,
    readOnly,
    demoMode,
    selectTab: (name) => setViewStack([{ name } as View]),
  };

  if (
    !demoMode &&
    !shareToken &&
    !inTelegram() &&
    location.hostname !== "localhost"
  ) {
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
    catalog: <Catalog />,
    catalogExercise: <CatalogExercise exerciseId={view.exerciseId} />,
    history: <History />,
    records: <Records />,
    recordDetail: (
      <RecordDetail exerciseId={view.exerciseId} title={view.title} />
    ),
    profile: <Profile />,
  };
  const rootTabs = ["landing", "catalog", "history", "records", "profile"];
  return (
    <AppContext.Provider value={appContext}>
      {demoMode && (
        <div class="mb-2 flex items-center justify-center gap-2 rounded-pill bg-accent-bg px-3 py-2 text-center text-[.72rem] font-[680] text-accent">
          <span>Modo demo · datos ficticios</span>
          {!readOnly && (
            <button
              type="button"
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
              title="Reiniciar demo"
              aria-label="Reiniciar demo"
              disabled={demoReset.pending}
              onClick={resetDemo}
            >
              <RotateCcw size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {demoMode && demoReset.error && <p role="alert">{demoReset.error}</p>}
      {!demoMode && !readOnly && <PendingWrites sync={workoutSync} />}
      {!demoReset.pending && (
        <Fragment key={demoReset.revision}>{screens[activeView.name]}</Fragment>
      )}
      {(!readOnly || demoMode) && rootTabs.includes(activeView.name) && (
        <TabBar active={activeView.name} onSelect={appContext.selectTab} />
      )}
    </AppContext.Provider>
  );
}

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  );
}
