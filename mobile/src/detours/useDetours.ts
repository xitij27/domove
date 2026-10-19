import { useCallback, useEffect, useState } from 'react';
import { strings } from '../i18n';
import type { SavedRoute } from '../routes/model';
import { planTrip, type TripPlan } from './trip';

export type DetourState =
  | { status: 'planning' }
  | { status: 'failed'; error: string }
  | ({ status: 'ready' } & TripPlan);

const PLANNING: DetourState = { status: 'planning' };

/** A route's way around construction, worked out again when the route changes and on retry. */
export function useDetours(route: SavedRoute | null, plan: typeof planTrip = planTrip): { state: DetourState | null; retry: () => void } {
  // Each result names its route and attempt, so a late answer for an earlier one never shows.
  const [result, setResult] = useState<{ route: SavedRoute; attempt: number; state: DetourState } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!route) return;
    // closing or changing the route stops the requests still waiting their turn
    const controller = new AbortController();
    plan(route, controller.signal).then(
      (trip) => { if (!controller.signal.aborted) setResult({ route, attempt, state: { status: 'ready', ...trip } }); },
      (e: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ route, attempt, state: { status: 'failed', error: e instanceof Error ? e.message : strings().errors.detoursFailed } });
      },
    );
    return () => controller.abort();
  }, [route, attempt, plan]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const mine = route && result?.route === route && result.attempt === attempt ? result.state : null;
  return { state: route ? mine ?? PLANNING : null, retry };
}
