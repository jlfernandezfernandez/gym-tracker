const PROFILE_NUMERIC_FIELDS = {
  weight_kg: { label: 'Peso (kg)', max: 500, integer: false },
  age: { label: 'Edad', max: 120, integer: true },
  height_cm: { label: 'Altura (cm)', max: 300, integer: true },
} as const;

type ProfileFieldPatchResult =
  | { payload: Record<string, unknown>; error?: undefined }
  | { payload?: undefined; error: string };

function normalizeNumber(raw: string) {
  return Number(raw.trim().replace(',', '.'));
}

export function buildProfileFieldPatch(key: string, value: string): ProfileFieldPatchResult {
  const numericRule = PROFILE_NUMERIC_FIELDS[key as keyof typeof PROFILE_NUMERIC_FIELDS];
  if (!numericRule) {
    return { payload: { [key]: value } };
  }

  const numericValue = normalizeNumber(value);
  const invalidInteger = numericRule.integer && !Number.isInteger(numericValue);
  if (
    !Number.isFinite(numericValue)
    || invalidInteger
    || numericValue <= 0
    || numericValue > numericRule.max
  ) {
    return { error: `Introduce un numero valido para ${numericRule.label}.` };
  }

  return {
    payload: {
      [key]: numericValue,
    },
  };
}