/** EditProfile: editable athlete fields via PATCH /profile. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'preact/hooks';
import { apiFetch } from '../../lib/api';
import { showToast } from '../../lib/helpers';
import { haptic } from '../../lib/telegram';
import { useApp } from '../App';
import { Empty, Loading, TopBar } from '../ui';

// ISSUE #10.3: fields the athlete can self-edit. Mirrors AthleteProfileIn.
const FIELDS = [
  { key: 'weight_kg', label: 'Peso (kg)', type: 'number', placeholder: '72' },
  { key: 'goal', label: 'Objetivo', type: 'text', placeholder: 'Hipertrofia' },
  { key: 'training_days_per_week', label: 'Días/semana', type: 'number', placeholder: '4' },
  { key: 'usual_session_minutes', label: 'Min/sesión', type: 'number', placeholder: '45' },
  { key: 'gym_name', label: 'Gimnasio', type: 'text', placeholder: 'Mi gym' },
  { key: 'injuries', label: 'Lesiones / patologías', type: 'text', placeholder: 'Resumen breve' },
  { key: 'preferred_exercises', label: 'Ejercicios que te gustan', type: 'text', placeholder: 'Press, sentadilla...' },
  { key: 'disliked_exercises', label: 'Ejercicios que no te gustan', type: 'text', placeholder: 'No me va el...' },
] as const;

export function EditProfile() {
  const app = useApp();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ['profile'], queryFn: () => apiFetch('GET', '/profile') });

  const [values, setValues] = useState<Record<string, string>>({});
  if (profileQuery.data && Object.keys(values).length === 0) {
    const initial: Record<string, string> = {};
    for (const field of FIELDS) {
      const raw = (profileQuery.data as any)[field.key];
      if (raw !== null && raw !== undefined && String(raw) !== '') initial[field.key] = String(raw);
    }
    setValues(initial);
  }

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {};
      for (const field of FIELDS) {
        const raw = values[field.key];
        if (raw === undefined || raw === '') continue;
        payload[field.key] = field.type === 'number' ? Number(raw) : raw;
      }
      return apiFetch('PATCH', '/profile', payload);
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(['profile'], updated);
      haptic('ok');
      showToast('Perfil guardado', 'ok');
      app.pop();
    },
    onError: (error: any) => {
      haptic('bad');
      showToast(error.message, 'err');
    },
  });

  const setField = (key: string, value: string) => setValues((state) => ({ ...state, [key]: value }));

  return (
    <>
      <TopBar title="Editar perfil" subtitle="Lo que guardas aquí ve el coach" onBack={app.pop} />
      {profileQuery.isLoading ? (
        <Loading />
      ) : profileQuery.isError || !profileQuery.data ? (
        <Empty icon="⚠️">No pude cargar el perfil.</Empty>
      ) : (
        <div class="card">
          {FIELDS.map((field, index) => (
            <label key={field.key} class={index === 0 ? '' : 'mt-2.5'}>
              <p class="text-xs">{field.label}</p>
              <input
                type={field.type}
                inputmode={field.type === 'number' ? 'decimal' : 'text'}
                placeholder={field.placeholder}
                value={values[field.key] ?? ''}
                onInput={(event: any) => setField(field.key, event.target.value)}
              />
            </label>
          ))}
          <button class="btn mt-3" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Guardando...' : '✓ Guardar'}
          </button>
        </div>
      )}
    </>
  );
}