/** Plan: session overview, exercise list, share and finish. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Repeat2,
  Share2,
  SkipForward,
  Trash2,
  WandSparkles,
} from "lucide-preact";
import { useRef, useState } from "preact/hooks";
import { apiFetch } from "../../lib/api";
import {
  completedSetCount,
  currentExercise,
  formatExerciseTargetBadge,
  formatEquipment,
  formatMuscle,
  formatStatus,
  mediaUrl,
  sessionMuscles,
  showToast,
} from "../../lib/helpers";
import { haptic } from "../../lib/telegram";
import { useApp, useCurrent, useSession } from "../../app/App";
import { Empty, Loading, Stat } from "../../components/feedback";
import { TopBar } from "../../components/navigation";
import { ConfirmSheet } from "../../components/sheet";
import { BodyMap } from "../../components/visualizations";
import { calculateMuscleLoadSplit } from "../../lib/volume";
import {
  selectionDefaults,
  serializePrescription,
  usesBodyweight,
  type TargetDraft,
} from "./prescription";

function refreshPlanQueries(
  queryClient: any,
  sessionId: number,
  updatedSession: any,
) {
  queryClient.setQueryData(["session", sessionId], updatedSession);
  queryClient.invalidateQueries({ queryKey: ["current", sessionId] });
  queryClient.invalidateQueries({ queryKey: ["active"] });
  queryClient.invalidateQueries({ queryKey: ["sessions"] });
  queryClient.invalidateQueries({ queryKey: ["session-activity"] });
  queryClient.invalidateQueries({ queryKey: ["records"] });
}

export function groupPlanExercises(
  exercises: any[],
  plannedExercises: any[] = [],
) {
  const groups = new Map<string, { key: string; label: string; exercises: any[] }>();
  for (const exercise of exercises) {
    const superset = exercise.superset_group ??
      plannedExercises.find(
        (planned) => String(planned.id) === String(exercise.planned_id),
      )?.superset_group;
    const muscle =
      formatMuscle(exercise.target || exercise.muscle_group || "") || "Otros";
    const key = superset ? `superset:${superset}` : `muscle:${muscle}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: superset ? `Superserie ${superset}` : muscle,
        exercises: [],
      });
    }
    groups.get(key)!.exercises.push(
      superset ? { ...exercise, superset_group: superset } : exercise,
    );
  }
  return [...groups.values()];
}

export function Plan() {
  const app = useApp();
  const queryClient = useQueryClient();
  const sessionQuery = useSession();
  const plan = sessionQuery.data;
  const currentQuery = useCurrent(plan?.id, plan?.status);
  const [pickerOpen, setPickerOpen] = useState(false);

  const repeatSession = useMutation({
    mutationFn: () => apiFetch("POST", `/sessions/${plan.id}/repeat`),
    onSuccess: (repeated) => {
      queryClient.setQueryData(["session", repeated.id], repeated);
      queryClient.invalidateQueries({ queryKey: ["active"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["session-activity"] });
      app.openSession(repeated.id);
      haptic("ok");
      showToast("Sesión repetida para hoy", "ok");
    },
    onError: (error: any) => {
      haptic("bad");
      showToast(error.message, "err");
    },
  });

  if (sessionQuery.isLoading) return <Loading message="Cargando plan..." />;
  if (!plan)
    return (
      <>
        {!app.readOnly && <TopBar title="Plan" onBack={app.pop} />}
        <Empty icon="🔗">No pude cargar este plan.</Empty>
      </>
    );

  const exercises = plan.exercises || [];
  const completedSetsTotal = exercises.reduce(
    (total: number, exercise: any) => total + completedSetCount(exercise),
    0,
  );
  const targetSetsTotal = exercises.reduce(
    (total: number, exercise: any) => total + (exercise.sets || 0),
    0,
  );
  const progressPct = targetSetsTotal
    ? Math.round((completedSetsTotal / targetSetsTotal) * 100)
    : 0;
  const muscles = sessionMuscles(exercises);
  // A finished session has no "current" exercise — the backend falls back to the last one.
  const currentPlannedId =
    plan.status === "completed"
      ? null
      : currentQuery.data?.current_planned_exercise_id;
  const openExercise = (plannedId: number) =>
    app.push({ name: "exercise", plannedId });

  return (
    <>
      <TopBar
        title={plan.title || "Entrenamiento"}
        subtitle={
          app.demoMode
            ? "Datos ficticios"
            : app.readOnly
              ? "Sesión compartida contigo"
              : "Tu ruta para hoy"
        }
        onBack={app.readOnly && !app.demoMode ? undefined : app.pop}
        action={
          !app.readOnly && plan.share_token ? (
            <ShareButton
              title={plan.title || "Entrenamiento"}
              token={plan.share_token}
            />
          ) : undefined
        }
      />
      <div class="card !p-5">
        <div>
          <div class="mt-[9px] flex flex-wrap gap-1.5">
            <span class="rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">
              {formatStatus(plan.status)}
            </span>
            <span class="rounded-pill bg-surface-2 px-2 py-1 text-[.68rem] font-[650] text-hint">
              {plan.duration_estimated || 0} min
            </span>
          </div>
          <p class="mt-2">
            {plan.goal || plan.coach_summary || "Plan generado por el coach"}
          </p>
          <div class="mt-2.5 grid grid-cols-3 gap-[9px]">
            <Stat label="Ejercicios" value={exercises.length} />
            <Stat
              label="Series"
              value={`${completedSetsTotal}/${targetSetsTotal}`}
            />
            <Stat label="Progreso" value={`${progressPct}%`} />
          </div>
        </div>
      </div>

      <div class="px-[3px] pt-[22px] pb-[3px]">
        <p class="text-[.68rem] font-bold tracking-[.07em] text-hint uppercase">
          Ruta del entreno
        </p>
        <h2 class="mt-1">{exercises.length} ejercicios</h2>
      </div>

      {groupPlanExercises(exercises, plan.planned_exercises).map((group) => (
        <section key={group.key} aria-label={group.label} class="mt-4">
          <h3 class="px-1 text-[.88rem] text-hint">{group.label}</h3>
          {group.exercises.map((exercise: any) => (
            <div key={exercise.planned_id}>
              <ExerciseCard
                exercise={exercise}
                isCurrent={String(exercise.planned_id) === String(currentPlannedId)}
                onOpen={() => openExercise(exercise.planned_id)}
              />
              {!app.readOnly && plan.status !== "completed" && (
                <WorkoutExerciseActions
                  sessionId={plan.id}
                  planStatus={plan.status}
                  exercise={exercise}
                />
              )}
            </div>
          ))}
        </section>
      ))}

      {!app.readOnly && plan.status !== "completed" && (
        <button
          class="btn-primary mt-2 bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-edge)]"
          disabled={app.workoutSync?.state?.pending.some((item) => item.sessionId === plan.id)}
          onClick={() => setPickerOpen(true)}
        >
          + Añadir ejercicio
        </button>
      )}

      {muscles.length > 0 && (
        <details class="card [&[open]>summary]:mb-2.5">
          <summary>Mapa muscular de la sesión</summary>
          <BodyMap muscles={muscles} />
        </details>
      )}

      {plan.status === "completed" && (
        <CompletedSummary plan={plan} exercises={exercises} />
      )}

      {!app.readOnly && plan.status === "completed" && (
        <button
          class="btn-primary mt-3 bg-ink text-canvas"
          disabled={repeatSession.isPending}
          onClick={() => repeatSession.mutate()}
        >
          <span class="inline-flex items-center gap-2">
            <Repeat2 class="size-4" strokeWidth={2.2} aria-hidden="true" />
            {repeatSession.isPending ? "Repitiendo..." : "Repetir sesión hoy"}
          </span>
        </button>
      )}

      {!app.readOnly && plan.status !== "completed" && (
        <div class="mt-3 flex items-center gap-[9px] [&>button]:min-w-0 [&>button]:flex-1">
          <button
            class="btn-primary bg-ink text-canvas"
            onClick={() => {
              const nextId = currentExercise(
                plan,
                currentQuery.data,
              )?.planned_id;
              if (nextId != null) openExercise(nextId);
            }}
          >
            Continuar
          </button>
          <FinishButton
            sessionId={plan.id}
            energy={plan.energy}
            discomfort={plan.discomfort}
          />
        </div>
      )}

      {pickerOpen && plan.status !== "completed" && (
        <PlanExercisePicker
          sessionId={plan.id}
          planStatus={plan.status}
          mode="add"
          onDismiss={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}

function ExerciseCard({
  exercise,
  isCurrent,
  onOpen,
}: {
  exercise: any;
  isCurrent: boolean;
  onOpen: () => void;
}) {
  const mediaSrc = mediaUrl(exercise.image_url || exercise.gif_url);
  return (
    <button
      class={`my-3 grid w-full cursor-pointer grid-cols-[88px_1fr] items-center gap-3.5 rounded-card border-0 bg-surface p-3.5 text-left text-ink shadow-card transition hover:bg-hover active:scale-[.985] active:bg-hover max-[380px]:grid-cols-[76px_1fr] ${isCurrent ? "ring-2 ring-accent/30 shadow-[0_6px_24px_rgba(0,0,0,.06)]" : ""}`}
      onClick={onOpen}
    >
      <div class="media-thumb size-[88px] max-[380px]:size-[76px] shrink-0 text-[1.7rem]">
        {mediaSrc ? (
          <img
            class="size-full object-contain p-1"
            src={mediaSrc}
            alt={exercise.name || "Ejercicio"}
            loading="lazy"
          />
        ) : (
          "🏋️"
        )}
      </div>
      <div class="min-w-0">
        <div class="flex items-start justify-between gap-3 [&>div]:min-w-0">
          <h3>{exercise.name || "Ejercicio"}</h3>
          <span class="rounded-pill bg-surface-2 px-2 py-1 text-[.68rem] font-[650] text-hint">
            {completedSetCount(exercise)}/{exercise.sets}
          </span>
        </div>
        <p>
          {formatMuscle(exercise.target || exercise.muscle_group || "")}
          {exercise.equipment
            ? ` · ${formatEquipment(exercise.equipment)}`
            : ""}
          {exercise.unilateral ? " · Unilateral" : ""}
        </p>
        <div class="mt-[9px] flex flex-wrap gap-1.5">
          {isCurrent && (
            <span class="rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">
              Sugerido
            </span>
          )}
          {exercise.superset_group && (
            <span class="rounded-pill bg-accent/15 px-2 py-1 text-[.68rem] font-[650] text-accent">
              ⚡ Superserie {exercise.superset_group}
            </span>
          )}
          <span class="rounded-pill bg-accent-bg px-2 py-1 text-[.68rem] font-[650] text-accent">
            {formatExerciseTargetBadge(exercise)}
          </span>
          <span
            class={`rounded-pill px-2 py-1 text-[.68rem] font-[650] ${exercise.status === "completed" ? "bg-ok-bg text-ok" : exercise.status === "skipped" ? "bg-warn-bg text-warn" : exercise.status === "in_progress" ? "bg-accent-bg text-accent" : "bg-surface-2 text-hint"}`}
          >
            {formatStatus(exercise.status)}
          </span>
        </div>
      </div>
    </button>
  );
}

export function CompletedSummary({
  plan,
  exercises,
}: {
  plan: any;
  exercises: any[];
}) {
  const totalPerformedSets = exercises.reduce(
    (total, exercise) => total + (exercise.performed_sets || []).length,
    0,
  );
  const split = calculateMuscleLoadSplit(exercises);

  return (
    <div class="card !p-5" data-testid="completed-summary">
      <div class="flex items-center justify-between gap-3">
        <h2>Sesión completada</h2>
        <span class="rounded-pill bg-ok-bg px-2.5 py-1 text-[.72rem] font-bold text-ok">
          ✓ Finalizada
        </span>
      </div>
      {plan.feedback && <p class="mt-2 text-hint italic">«{plan.feedback}»</p>}
      <div class="mt-3.5 grid grid-cols-3 gap-[9px]">
        <Stat label="Series" value={totalPerformedSets} />
        <Stat
          label="Volumen"
          value={`${Math.round(plan.total_volume || split.totalLoad || 0)} kg`}
        />
        <Stat
          label="Duración"
          value={
            plan.duration_actual || plan.duration_estimated
              ? `${plan.duration_actual || plan.duration_estimated} min`
              : "—"
          }
        />
      </div>

      {/* Post-Workout Muscle Load Split (Requirement R5) */}
      {split.muscles.length > 0 && (
        <div
          class="mt-5 pt-4 border-t border-edge"
          data-testid="muscle-load-split"
        >
          <div class="flex items-center justify-between gap-2">
            <h3 class="text-[.92rem] font-bold text-ink">
              Distribución de carga muscular
            </h3>
            <span class="text-[.7rem] text-hint font-medium">
              {split.muscles.length} grupos
            </span>
          </div>
          <p class="mt-0.5 text-[.72rem] text-hint">
            Porcentaje de volumen efectivo absorbido (excluye series de
            calentamiento).
          </p>

          {/* Multi-segment proportional stacked split bar */}
          <div
            class="mt-3 flex h-[14px] w-full overflow-hidden rounded-pill bg-surface-2 p-[2px] shadow-inner"
            aria-label="Barra proporcional de carga muscular"
            data-testid="split-progress-bar"
          >
            {split.muscles.map((item) => (
              <div
                key={item.muscle}
                class="h-full first:rounded-l-pill last:rounded-r-pill transition-all"
                style={{
                  flexGrow: item.load,
                  flexBasis: `${Math.max(item.percentage, 3)}%`,
                  minWidth: "4px",
                  backgroundColor: item.color || "var(--color-accent)",
                }}
                title={`${item.name}: ${item.percentage}% (${item.load} kg)`}
              />
            ))}
          </div>

          {/* Ranked muscle breakdown rows */}
          <div class="mt-3.5 space-y-2.5" data-testid="muscle-split-list">
            {split.muscles.map((item) => (
              <div
                key={item.muscle}
                class="rounded-xl bg-surface-2 p-2.5 shadow-xs"
              >
                <div class="flex items-center justify-between text-[.82rem]">
                  <div class="flex items-center gap-2 min-w-0">
                    <span
                      class="size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: item.color || "var(--color-accent)",
                      }}
                      aria-hidden="true"
                    />
                    <span class="font-bold text-ink truncate">{item.name}</span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0 text-[.8rem]">
                    <span class="font-bold text-accent">
                      {item.percentage}%
                    </span>
                    <span class="text-[.72rem] text-hint">
                      ({item.load} kg)
                    </span>
                  </div>
                </div>

                {/* Individual progress track */}
                <div class="mt-1.5 h-[5px] w-full overflow-hidden rounded-pill bg-track-dim">
                  <div
                    class="h-full rounded-pill transition-all"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color || "var(--color-accent)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Session BodyMap visualization */}
          <div class="mt-4 rounded-card bg-surface-2 p-3">
            <p class="text-[.7rem] font-bold uppercase tracking-wider text-hint mb-1">
              Mapa de absorción
            </p>
            <BodyMap
              mode="balance"
              volumeData={split.volumeMap}
              showLegend={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ShareButton({ title, token }: { title: string; token: string }) {
  const share = async () => {
    const shareUrl = `${location.origin}/session/share/${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      haptic("ok");
      showToast("Enlace copiado — pásaselo a tu compañero", "ok");
    } catch {
      // Clipboard can be blocked (Telegram webview) — fall back to the native share sheet.
      if (navigator.share)
        navigator.share({ title, url: shareUrl }).catch(() => {});
      else prompt("Copia el enlace:", shareUrl);
    }
  };
  return (
    <button
      class="min-h-11 min-w-11 cursor-pointer rounded-pill border-0 bg-surface px-[14px] text-[.82rem] font-[680] text-accent shadow-[0_1px_2px_rgba(0,0,0,.06),inset_0_0_0_1px_rgba(0,0,0,.04)] active:scale-95"
      onClick={share}
    >
      <span class="inline-flex items-center gap-2">
        <Share2 class="size-4" strokeWidth={2} aria-hidden="true" />
        Compartir
      </span>
    </button>
  );
}

function FinishButton({
  sessionId,
  energy,
  discomfort,
}: {
  sessionId: number;
  energy: number;
  discomfort: string;
}) {
  const queryClient = useQueryClient();
  const app = useApp();
  const unresolved = app.workoutSync?.state?.pending.some(
    (item) => item.sessionId === sessionId,
  );
  const [isOpen, setIsOpen] = useState(false);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  const finishSession = useMutation({
    mutationFn: () =>
      apiFetch("POST", `/sessions/${sessionId}/finish`, {
        feedback: feedbackRef.current?.value || "",
        energy: energy || 5,
        discomfort: discomfort || "",
      }),
    onSuccess: (updatedSession) => {
      queryClient.setQueryData(["session", sessionId], updatedSession);
      queryClient.invalidateQueries({ queryKey: ["active"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["records"] });
      setIsOpen(false);
      haptic("ok");
      showToast("Sesión finalizada", "ok");
    },
    onError: (error: any) => {
      haptic("bad");
      showToast(error.message, "err");
    },
  });

  return (
    <>
      <button
        disabled={unresolved}
        class="btn-primary bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-edge)] disabled:opacity-35"
        onClick={() => setIsOpen(true)}
      >
        ✓ Finalizar
      </button>
      <ConfirmSheet
        open={isOpen}
        title="Finalizar sesión"
        message="Cuéntale al coach cómo ha ido (opcional)."
        confirmLabel="✓ Finalizar"
        busy={finishSession.isPending}
        onConfirm={() => finishSession.mutate()}
        onCancel={() => setIsOpen(false)}
      >
        <textarea
          ref={feedbackRef}
          class="mt-3"
          placeholder="Fácil, duro, molestias, sensaciones..."
        />
      </ConfirmSheet>
    </>
  );
}

function usePlanEditGuard(sessionId: number, planStatus: string, exercise?: any) {
  const app = useApp();
  const hidden = app.readOnly || planStatus === "completed";
  const pending = app.workoutSync?.state?.pending.some((item) => item.sessionId === sessionId);
  const hasLoggedSets = (exercise?.performed_sets || []).length > 0;
  return {
    hidden,
    blocked: hidden || Boolean(pending),
    hasLoggedSets,
    assertAllowed: (destructive = false) => {
      if (hidden) throw new Error("Esta sesión no se puede editar");
      if (pending) throw new Error("Sincroniza las series pendientes antes de editar el plan");
      if (destructive && hasLoggedSets) throw new Error("El ejercicio ya tiene series registradas");
    },
  };
}

export function WorkoutExerciseActions({
  sessionId,
  planStatus,
  exercise,
  onDeleted,
  onReplaced,
}: {
  sessionId: number;
  planStatus: string;
  exercise: any;
  onDeleted?: () => void;
  onReplaced?: () => void;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<"replace" | "delete" | null>(null);
  const deleteContentRef = useRef<HTMLDivElement>(null);
  const guard = usePlanEditGuard(sessionId, planStatus, exercise);
  const { hasLoggedSets } = guard;
  const skip = useMutation({
    mutationFn: async () => {
      guard.assertAllowed();
      return apiFetch(
        "PUT",
        `/sessions/${sessionId}/exercises/${exercise.planned_id}`,
        {
          status: exercise.status === "skipped" ? "pending" : "skipped",
        },
      );
    },
    onSuccess: (updated) => {
      refreshPlanQueries(queryClient, sessionId, updated);
      haptic("ok");
    },
    onError: (error: any) => showToast(error.message, "err"),
  });
  const remove = useMutation({
    mutationFn: async () => {
      guard.assertAllowed(true);
      return apiFetch("DELETE", `/sessions/${sessionId}/exercises/${exercise.planned_id}`);
    },
    onSuccess: (updated) => {
      deleteContentRef.current?.closest("dialog")?.close();
      setAction(null);
      refreshPlanQueries(queryClient, sessionId, updated);
      haptic("ok");
      showToast("Ejercicio eliminado", "ok");
      onDeleted?.();
    },
    onError: (error: any) => {
      haptic("bad");
      showToast(error.message, "err");
    },
  });
  const isBusy = guard.blocked || skip.isPending || remove.isPending;

  if (guard.hidden) return null;

  return (
    <>
    <details class="mb-3 -mt-1 px-3 pb-2">
      <summary class="cursor-pointer py-2 text-[.78rem] font-[680] text-hint">
        Opciones de {exercise.name || "ejercicio"}
      </summary>
      <div class="flex flex-wrap gap-2 pt-2">
        <button
          class="rounded-pill border-0 bg-surface-2 px-3 py-2 text-[.78rem] font-[680] text-ink disabled:opacity-35"
          disabled={isBusy || planStatus === "completed"}
          onClick={() => skip.mutate()}
        >
          <span class="inline-flex items-center gap-1.5">
            <SkipForward class="size-3.5" strokeWidth={2} aria-hidden="true" />
            {exercise.status === "skipped" ? "Desmarcar skip" : "Saltar"}
          </span>
        </button>
        <button
          class="rounded-pill border-0 bg-surface-2 px-3 py-2 text-[.78rem] font-[680] text-ink disabled:opacity-35"
          disabled={isBusy || hasLoggedSets}
          onClick={() => setAction("replace")}
        >
          <span class="inline-flex items-center gap-1.5">
            <WandSparkles class="size-3.5" strokeWidth={2} aria-hidden="true" />
            Reemplazar
          </span>
        </button>
        <button
          class="rounded-pill border-0 bg-err/10 px-3 py-2 text-[.78rem] font-[680] text-err disabled:opacity-35"
          disabled={isBusy || hasLoggedSets}
          onClick={() => setAction("delete")}
        >
          <span class="inline-flex items-center gap-1.5">
            <Trash2 class="size-3.5" strokeWidth={2} aria-hidden="true" />
            Eliminar
          </span>
        </button>
      </div>
      {hasLoggedSets && (
        <p class="mt-2 text-[.74rem] text-hint">
          Reemplazar y eliminar quedan desactivados porque este ejercicio ya
          tiene series registradas.
        </p>
      )}
    </details>
    {action === "replace" && (
      <PlanExercisePicker
        sessionId={sessionId}
        planStatus={planStatus}
        mode="replace"
        exercise={exercise}
        onSaved={onReplaced}
        onDismiss={() => setAction(null)}
      />
    )}
    <ConfirmSheet
      open={action === "delete"}
      title="Eliminar ejercicio"
      message={`Se quitará ${exercise.name || "este ejercicio"} del plan actual.`}
      confirmLabel="Eliminar"
      busy={isBusy || hasLoggedSets}
      onCancel={() => setAction(null)}
      onConfirm={() => remove.mutate()}
    >
      <div ref={deleteContentRef} />
    </ConfirmSheet>
    </>
  );
}

export function PlanExercisePicker({
  sessionId,
  planStatus,
  mode,
  exercise,
  onDismiss,
  onSaved,
}: {
  sessionId: number;
  planStatus: string;
  mode: "add" | "replace";
  exercise?: any;
  onDismiss: () => void;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const guard = usePlanEditGuard(sessionId, planStatus, exercise);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [metric, setMetric] = useState<
    "reps" | "duration_minutes" | "duration_seconds"
  >("reps");
  const [targetSets, setTargetSets] = useState(String(exercise?.sets || 3));
  const [targetValue, setTargetValue] = useState("10");
  const [weight, setWeight] = useState("");
  const [targets, setTargets] = useState<TargetDraft[] | null>(null);
  const contentRef = useRef<HTMLFieldSetElement>(null);
  const dismiss = () => {
    contentRef.current?.closest("dialog")?.close();
    onDismiss();
  };
  const listQuery = useQuery({
    queryKey: ["plan-picker", search],
    queryFn: () =>
      apiFetch(
        "GET",
        `/exercises?limit=20&offset=0${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      ),
  });

  const save = useMutation({
    mutationFn: () => {
      guard.assertAllowed(mode === "replace");
      if (!selected) throw new Error("Elige un ejercicio del catálogo");
      const payload = serializePrescription(selected, {
        sets: targetSets, metric, value: targetValue, weight, targets,
      });
      if (mode === "add") {
        return apiFetch("POST", `/sessions/${sessionId}/exercises`, {
          exercise_id: selected.id,
          ...payload,
        });
      }
      return apiFetch(
        "PUT",
        `/sessions/${sessionId}/exercises/${exercise.planned_id}`,
        {
          new_exercise_id: selected.id,
          ...payload,
        },
      );
    },
    onSuccess: (updated) => {
      refreshPlanQueries(queryClient, sessionId, updated);
      haptic("ok");
      showToast(
        mode === "add" ? "Ejercicio añadido" : "Ejercicio reemplazado",
        "ok",
      );
      dismiss();
      onSaved?.();
    },
    onError: (error: any) => {
      haptic("bad");
      showToast(error.message, "err");
    },
  });

  const isCardio = selected?.activity_type === "cardio";
  const bodyweight = usesBodyweight(selected);
  const selectedName = selected?.name || exercise?.name || "";
  const metricLabel = isCardio ? "Minutos" : metric === "duration_seconds" ? "Segundos" : "Reps";
  const blocked = guard.blocked || (mode === "replace" && guard.hasLoggedSets);
  const resizeTargets = (value: string, previous: TargetDraft[] = []) =>
    Array.from({ length: Math.max(1, Math.min(20, parseInt(value, 10) || 1)) }, (_, index) =>
      previous[index] ?? { weight, value: targetValue },
    );

  return (
    <ConfirmSheet
      open={true}
      title={mode === "add" ? "Añadir ejercicio" : "Reemplazar ejercicio"}
      message={mode === "replace" ? exercise?.name || "" : ""}
      confirmLabel={mode === "add" ? "Añadir" : "Reemplazar"}
      busy={save.isPending || blocked}
      onConfirm={() => save.mutate()}
      onCancel={dismiss}
    >
      <fieldset ref={contentRef} disabled={save.isPending || blocked} class="min-w-0 border-0 p-0">
      <input
        type="search"
        class="mt-3"
        placeholder="Buscar en el catálogo"
        value={search}
        onInput={(event: any) => setSearch(event.target.value)}
      />
      <div class="mt-3 max-h-48 overflow-y-auto rounded-2xl bg-surface-2">
        {((listQuery.data as any[]) || []).map((item: any) => (
          <button
            key={item.id}
            class={`grid w-full cursor-pointer grid-cols-[1fr_auto] gap-3 border-0 border-b border-edge px-3 py-3 text-left transition-colors duration-150 first:rounded-t-2xl last:rounded-b-2xl last:border-b-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${selected?.id === item.id ? "bg-accent/10" : "bg-transparent hover:bg-hover active:bg-hover"}`}
            onClick={() => {
              setSelected(item);
              const defaults = selectionDefaults(item);
              setMetric(defaults.metric);
              setWeight(defaults.weight);
              setTargetValue(defaults.value);
              setTargets(null);
            }}
          >
            <span class="min-w-0">
              <b class="block truncate text-[.88rem]">{item.name}</b>
              <span class="block text-[.72rem] text-hint">
                {formatMuscle(item.target || item.muscle_group)}
                {item.equipment ? ` · ${formatEquipment(item.equipment)}` : ""}
              </span>
            </span>
            <span class="text-[.72rem] font-[700] text-hint">
              {item.activity_type === "cardio" ? "Cardio" : "Fuerza"}
            </span>
          </button>
        ))}
      </div>
      <p class="mt-3 text-[.74rem] text-hint">
        {selectedName
          ? `Elegido: ${selectedName}`
          : "Elige un ejercicio para continuar."}
      </p>
      {!isCardio && (
        <label class="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            class="!w-auto"
            checked={metric === "duration_seconds"}
            onChange={(event: any) => {
              setMetric(event.target.checked ? "duration_seconds" : "reps");
              setTargetValue(event.target.checked ? "30" : "10");
              setTargets(null);
            }}
          />
          Por tiempo
        </label>
      )}
      <div class="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label>Series</label>
          <input
            type="text"
            inputmode="numeric"
            aria-label="Series"
            value={targetSets}
            onInput={(event: any) => {
              setTargetSets(event.target.value);
              if (targets) setTargets(resizeTargets(event.target.value, targets));
            }}
          />
        </div>
        {!targets && (
        <div>
          <label>
            {metricLabel} para todas las series
          </label>
          <input
            type="text"
            inputmode="numeric"
            aria-label={`${metricLabel} para todas las series`}
            value={targetValue}
            onInput={(event: any) => setTargetValue(event.target.value)}
          />
        </div>
        )}
      </div>
      {!isCardio && !bodyweight && !targets && (
        <div class="mt-3">
          <label>Peso para todas las series (kg)</label>
          <input
            type="text"
            inputmode="decimal"
            aria-label="Peso para todas las series (kg)"
            value={weight}
            onInput={(event: any) => setWeight(event.target.value)}
            placeholder="Sin carga adicional"
          />
        </div>
      )}
      {!isCardio && bodyweight && <p class="mt-3 text-[.78rem] text-hint">Peso corporal · Sin carga en kg</p>}
      <label class="mt-3 flex items-center gap-2">
        <input
          type="checkbox"
          class="!w-auto"
          checked={targets !== null}
          onChange={(event: any) => setTargets(event.target.checked ? resizeTargets(targetSets) : null)}
        />
        Personalizar por serie
      </label>
      {targets && (
        <div class="mt-3 space-y-3">
          {targets.map((target, index) => (
            <div key={index} class="border-t border-edge pt-3">
              <p class="text-[.78rem] font-bold">Serie {index + 1}</p>
              <div class={`mt-2 grid gap-3 ${!isCardio && !bodyweight ? "grid-cols-2" : "grid-cols-1"}`}>
                {!isCardio && !bodyweight && (
                  <label class="min-w-0">
                    Peso (kg)
                    <input
                      type="text"
                      inputmode="decimal"
                      aria-label={`Peso serie ${index + 1} (kg)`}
                      value={target.weight}
                      placeholder="Sin carga adicional"
                      onInput={(event: any) => setTargets(targets.map((row, rowIndex) => rowIndex === index ? { ...row, weight: event.target.value } : row))}
                    />
                  </label>
                )}
                <label class="min-w-0">
                  {metricLabel}
                  <input
                    type="text"
                    inputmode="numeric"
                    aria-label={`${metricLabel} serie ${index + 1}`}
                    value={target.value}
                    onInput={(event: any) => setTargets(targets.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
      </fieldset>
    </ConfirmSheet>
  );
}
