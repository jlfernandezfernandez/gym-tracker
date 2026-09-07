export type LaunchRoute = {
  sessionId?: number;
  plannedExerciseId?: number;
  shareToken?: string;
  readOnly: boolean;
};

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseLaunchRoute(pathname: string): LaunchRoute {
  const pathSegments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (pathSegments[0] !== 'session') {
    return { readOnly: false };
  }
  if (pathSegments[1] === 'share' && pathSegments[2]) {
    return {
      shareToken: pathSegments[2],
      plannedExerciseId:
        pathSegments[3] === 'exercise' ? parsePositiveInt(pathSegments[4]) : undefined,
      readOnly: true,
    };
  }
  const sessionId = parsePositiveInt(pathSegments[1]);
  return {
    sessionId,
    plannedExerciseId:
      sessionId && pathSegments[2] === 'exercise'
        ? parsePositiveInt(pathSegments[3])
        : undefined,
    readOnly: false,
  };
}