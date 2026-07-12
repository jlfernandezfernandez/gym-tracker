/** Profile: athlete data with inline editing. Apple-style: tap a field, confirm, done. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import { Empty, Loading } from '../../components/feedback';
import { TopBar } from '../../components/navigation';
import { MeasurementChart } from '../../components/visualizations';

const MEASURES = [
  { key: 'weight_kg', label: 'Peso corporal', unit: ' kg' },
  { key: 'muscle_kg', label: 'Músculo', unit: ' kg' },
  { key: 'fat_kg', label: 'Grasa', unit: ' kg' },
  { key: 'body_fat_pct', label: '% grasa', unit: '%' },
  { key: 'visceral_fat', label: 'Grasa visceral', unit: '' },
] as const;

const GOALS = ['Fuerza', 'Hipertrofia', 'Resistencia', 'Pérdida de grasa', 'Salud', 'Rendimiento deportivo'];
const EXPERIENCE = ['Principiante', 'Intermedio', 'Avanzado'];

const SELECT_FIELDS = [
  { key: 'goal', label: 'Objetivo', options: GOALS },
  { key: 'experience_level', label: 'Experiencia', options: EXPERIENCE },
] as const;

const NUMERIC_FIELDS = [
  { key: 'weight_kg', label: 'Peso (kg)', suffix: ' kg', placeholder: '72', inputMode: 'decimal' },
  { key: 'age', label: 'Edad', suffix: ' años', placeholder: '30', inputMode: 'numeric' },
  { key: 'height_cm', label: 'Altura (cm)', suffix: ' cm', placeholder: '178', inputMode: 'numeric' },
] as const;

const ALL_FIELDS = [...SELECT_FIELDS, ...NUMERIC_FIELDS];

function InlineSelect({ value, options, onSave }: { value: string; options: readonly string[]; onSave: (v: string) => void }) {
  return (
    <select class="min-h-9 cursor-pointer border-0 bg-transparent pr-1 text-right text-[.85rem] font-[580] text-hint outline-none" value={value} onChange={(e: any) => onSave(e.target.value)}>
      {(value ? [] : ['']).concat([...options]).map((opt) => (
        <option key={opt} value={opt}>{opt || '—'}</option>
      ))}
    </select>
  );
}

function InlineNumber({ value, placeholder, suffix, inputMode, onSave }: { value: string; placeholder: string; suffix: string; inputMode: 'decimal' | 'numeric'; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <input
        class="!min-h-9 !w-24 !rounded-[10px] !border-accent !px-2.5 !py-1 !text-right text-base font-[580]"
        type="text"
        inputmode={inputMode}
        enterkeyhint="done"
        autofocus
        value={draft}
        placeholder={placeholder}
        onInput={(e: any) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft && draft !== value) onSave(draft);
        }}
        onKeyDown={(e: any) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
    );
  }
  return (
    <button class="min-h-9 cursor-pointer rounded-lg border-0 bg-transparent px-2 py-1 text-right text-[.85rem] font-[580] text-hint transition active:bg-hover" onClick={() => { setDraft(value); setEditing(true); }}>
      {value ? `${value}${suffix}` : '—'}
    </button>
  );
}

export function Profile() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => apiFetch('GET', '/profile') });
  const measurementsQuery = useQuery({
    queryKey: ['measurements'],
    queryFn: () => apiFetch('GET', '/profile/measurements?limit=8'),
    retry: 0,
  });

  const profile = profileQuery.data;
  const measurements: any[] = measurementsQuery.data || [];

  const patch = useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiFetch('PATCH', '/profile', payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(['profile'], updated);
      queryClient.invalidateQueries({ queryKey: ['measurements'] });
    },
  });

  const saveField = (key: string, value: string) => {
    const numFields = ['weight_kg', 'age', 'height_cm'];
    const payload: Record<string, unknown> = { [key]: numFields.includes(key) ? Number(value) : value };
    patch.mutate(payload);
  };

  if (profileQuery.isLoading) return <><TopBar title="Perfil" /><Loading /></>;
  if (profileQuery.isError || !profile)
    return <><TopBar title="Perfil" /><Empty icon="⚠️">No pude cargar el perfil.</Empty></>;

  return (
    <>
      <TopBar title="Perfil" subtitle="El contexto que utiliza tu coach" />

      {/* Athlete identity */}
      <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
        <p class="text-[.68rem] font-bold tracking-[.07em] text-hint uppercase">Atleta</p>
        <h1>{profile.name || 'Atleta'}</h1>
        <p>{profile.onboarding_complete ? 'Perfil deportivo activo' : 'Completa el perfil con tu coach'}</p>
      </div>

      {/* Training & body */}
      <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
        <h2>Entrenamiento y cuerpo</h2>
        <div class="mt-2.5 grid overflow-hidden rounded-control bg-surface-2">
          {ALL_FIELDS.map((field) => {
            const raw = String((profile as any)[field.key] ?? '');
            return (
              <div class="flex min-h-12 items-center justify-between gap-3 border-b border-edge px-[15px] py-[13px] last:border-b-0" key={field.key}>
                <span class="whitespace-nowrap text-[.85rem] font-[680] text-ink">{field.label}</span>
                {'options' in field ? (
                  <InlineSelect value={raw} options={field.options} onSave={(v) => saveField(field.key, v)} />
                ) : <InlineNumber value={raw} placeholder={field.placeholder} suffix={field.suffix} inputMode={field.inputMode} onSave={(v) => saveField(field.key, v)} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Coach notes */}
      {profile.notes && (
        <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
          <h2>Notas del coach</h2>
          <p>{profile.notes}</p>
        </div>
      )}

      {/* Measurements with charts */}
      <div class="my-3 rounded-card bg-surface p-[18px] shadow-card">
        <h2>Mediciones</h2>
        {measurements.length < 2 ? (
          <p>{measurements.length === 0
            ? 'Aquí irán peso, grasa, músculo, perímetros o cualquier medición por fecha cuando el coach las añada.'
            : 'Necesitas al menos 2 mediciones para ver la evolución.'}</p>
        ) : (
          <div class="mt-2.5 grid gap-3">
            {MEASURES.map((metric) => {
              const points = measurements
                .filter((m: any) => m[metric.key] != null)
                .map((m: any) => ({
                  date: new Date(m.measured_at).toISOString().slice(0, 10),
                  value: m[metric.key],
                }))
                .reverse();
              if (points.length < 2) return null;
              const latest = points[points.length - 1].value;
              const first = points[0].value;
              const delta = latest - first;
              const trend = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
              return (
                <div class="rounded-control bg-surface-2 px-[15px] py-[14px]" key={metric.key}>
                  <div class="mb-1 flex items-center justify-between">
                    <h3>{metric.label}</h3>
                    <span class={`rounded-pill px-2 py-1 text-[.68rem] font-[650] ${delta > 0 ? 'bg-ok-bg text-ok' : delta < 0 ? 'bg-warn-bg text-warn' : 'bg-surface text-hint'}`}>
                      {trend} {delta !== 0 ? `${Math.abs(delta).toFixed(1)}${metric.unit}` : 'igual'}
                    </span>
                  </div>
                  <MeasurementChart points={points} unit={metric.unit} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
