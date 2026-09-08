/** History: recent sessions list. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Clock3, Repeat2 } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { apiFetch } from "../../lib/api";
import { formatDay, showToast } from "../../lib/helpers";
import { useApp } from "../../app/App";
import { Empty, Loading } from "../../components/feedback";
import { TopBar } from "../../components/navigation";
import { Heatmap } from "../../components/visualizations";

/** Monday 00:00 (local) of the week containing the given date. */
function weekStart(date: Date): Date {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

function weekLabel(start: Date, currentWeekStart: Date): string {
  const daysApart = Math.round(
    (currentWeekStart.getTime() - start.getTime()) / 86400000,
  );
  if (daysApart === 0) return "Esta semana";
  if (daysApart === 7) return "Semana pasada";
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const shortDay = (day: Date) =>
    day.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  return `${shortDay(start)} – ${shortDay(end)}`;
}

/** Groups sessions (already newest-first) into weeks, preserving order. */
function groupByWeek(sessions: any[]): [string, any[]][] {
  const currentWeekStart = weekStart(new Date());
  return [
    ...Map.groupBy(sessions, (session: any) =>
      weekLabel(
        weekStart(new Date(session.session_date + "T00:00:00")),
        currentWeekStart,
      ),
    ),
  ];
}

export function buildHistoryPath({
  pageSize,
  offset,
  selectedDate,
}: {
  pageSize: number;
  offset: number;
  selectedDate: string | null;
}) {
  const params = new URLSearchParams({
    limit: String(pageSize),
    offset: String(offset),
    completed_only: "true",
  });
  if (selectedDate) {
    params.set("on_date", selectedDate);
  }
  return `/sessions?${params.toString()}`;
}

export function mergeHistoryPage(
  currentPages: Record<number, any[]>,
  offset: number,
  pageSessions: any[],
) {
  const pages = {
    ...currentPages,
    [offset]: [...pageSessions],
  };
  return { pages, sessions: historySessions(pages) };
}

export function historySessions(pages: Record<number, any[]>) {
  const seenIds = new Set<number>();
  return Object.keys(pages)
    .map(Number)
    .sort((first, second) => first - second)
    .flatMap((pageOffset) => pages[pageOffset] || [])
    .filter((session) => {
      if (seenIds.has(session.id)) return false;
      seenIds.add(session.id);
      return true;
    });
}

export function History() {
  const app = useApp();
  const queryClient = useQueryClient();
  const PAGE_SIZE = 20;
  const [offset, setOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sessionPages, setSessionPages] = useState<Record<number, any[]>>({});
  const activityQuery = useQuery({
    queryKey: ["session-activity"],
    queryFn: () => apiFetch("GET", "/sessions/activity?days=365"),
  });
  const sessionsQuery = useQuery({
    queryKey: selectedDate
      ? ["sessions", "history", offset, selectedDate]
      : ["sessions", "history", offset],
    queryFn: () =>
      apiFetch(
        "GET",
        buildHistoryPath({ pageSize: PAGE_SIZE, offset, selectedDate }),
      ),
  });

  useEffect(() => {
    if (!Array.isArray(sessionsQuery.data)) return;
    setSessionPages(
      (currentPages) =>
        mergeHistoryPage(currentPages, offset, sessionsQuery.data).pages,
    );
  }, [offset, sessionsQuery.data]);

  const mergedSessions = historySessions(sessionPages);
  const visibleSessions =
    mergedSessions.length > 0
      ? mergedSessions
      : Array.isArray(sessionsQuery.data)
        ? sessionsQuery.data
        : [];
  const hasMore = (sessionsQuery.data?.length || 0) === PAGE_SIZE;

  const toggleSelectedDate = (date: string) => {
    setOffset(0);
    setSessionPages({});
    setSelectedDate((current) => (current === date ? null : date));
  };

  return (
    <>
      <TopBar title="Historial" subtitle="Tu entrenamiento, en orden" />
      {sessionsQuery.isLoading ? (
        <Loading />
      ) : sessionsQuery.isError ? (
        <Empty icon="⚠️">No pude cargar el historial.</Empty>
      ) : !visibleSessions.length ? (
        <>
          <Heatmap sessions={activityQuery.data || []} className="mt-3" />
          <Empty icon="📊">
            Sin historial todavía.
            <br />
            Empieza a entrenar con el coach.
          </Empty>
        </>
      ) : (
        <>
          {/* Training Activity Heatmap (Requirement R4) */}
          <Heatmap
            sessions={activityQuery.data || []}
            onSelectDate={(date) => toggleSelectedDate(date)}
            selectedDate={selectedDate}
            className="mt-3 mb-1"
          />

          {groupByWeek(visibleSessions).map(([label, sessions]) => (
            <section key={label}>
              <p class="mt-5 mb-0.5 ml-[3px] text-[.68rem] font-bold tracking-[.07em] text-hint uppercase first:mt-2.5">
                {label}
              </p>
              <div class="mt-2 overflow-hidden rounded-card bg-surface [content-visibility:auto] [contain-intrinsic-size:auto_500px]">
                {sessions.map((session: any) => (
                  <HistorySessionRow
                    key={session.id}
                    app={app}
                    queryClient={queryClient}
                    session={session}
                  />
                ))}
              </div>
            </section>
          ))}
          {hasMore && (
            <button
              class="btn-primary mt-4 bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-edge)]"
              disabled={sessionsQuery.isLoading}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
            >
              Cargar más
            </button>
          )}
        </>
      )}
    </>
  );
}

function HistorySessionRow({
  app,
  queryClient,
  session,
}: {
  app: any;
  queryClient: any;
  session: any;
}) {
  const repeat = useMutation({
    mutationFn: () => apiFetch("POST", `/sessions/${session.id}/repeat`),
    onSuccess: (repeated) => {
      queryClient.setQueryData(["session", repeated.id], repeated);
      queryClient.invalidateQueries({ queryKey: ["active"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["session-activity"] });
      app.openSession(repeated.id);
    },
    onError: (error: any) => showToast(error.message, "err"),
  });

  return (
    <div class="grid min-h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-edge px-2 py-1.5 last:border-b-0">
      <button
        class="group grid min-h-16 min-w-0 cursor-pointer grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-control border-0 bg-transparent px-[7px] py-1.5 text-left text-ink transition-colors hover:bg-hover active:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        onClick={() => app.openSession(session.id)}
      >
        <span class="text-[1.15rem] font-semibold leading-none text-ink">
          {formatDay(session.session_date)}
        </span>
        <span class="min-w-0">
          <b class="block overflow-hidden text-[.9rem] text-ellipsis whitespace-nowrap">
            {session.title || "Entrenamiento"}
          </b>
          <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[.72rem] text-hint">
            <span class="rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[.66rem] font-medium text-hint">
              {session.exercise_count || 0} ejerc.
            </span>
            <span class="rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[.66rem] font-medium text-hint">
              {session.total_sets || 0} series
            </span>
            {session.duration_actual ? (
              <span class="rounded-[6px] bg-surface-2 px-1.5 py-0.5 text-[.66rem] font-medium text-hint">
                <span class="inline-flex items-center gap-1 align-middle">
                  <Clock3 class="size-3.5" strokeWidth={2} aria-hidden="true" />
                  {session.duration_actual} min
                </span>
              </span>
            ) : null}
          </div>
        </span>
        <span class="text-divider transition-transform group-active:translate-x-0.5">
          <ChevronRight class="size-5" strokeWidth={2} aria-hidden="true" />
        </span>
      </button>
      {session.status === "completed" && (
        <button
          class="inline-flex min-h-11 items-center gap-1.5 rounded-pill border-0 bg-accent-bg px-3 py-2 text-[.68rem] font-[680] text-accent transition-colors hover:bg-accent-soft active:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:opacity-40"
          disabled={repeat.isPending}
          onClick={() => repeat.mutate()}
        >
          <Repeat2 class="size-3.5" strokeWidth={2} aria-hidden="true" />
          Repetir
        </button>
      )}
    </div>
  );
}
