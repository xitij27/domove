import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TransportMode } from '../routes/model';
import { ratingsApi, type RatingsApi } from './api';
import type { RouteSiteRating, SiteRating } from './model';

export type Loaded<T> = { value: T | null; error: string | null; loading: boolean; retry: () => void };

/**
 * Runs `load` whenever it changes (a new site, mode or route) and again on retry. Each result
 * names its key, so a late answer for an earlier site or route never shows.
 */
function useKeyed<T>(key: string | null, load: (() => Promise<T>) | null, fallback: string): Loaded<T> {
  const [result, setResult] = useState<{ key: string; attempt: number; value: T | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!key || !load) return;
    let active = true;
    load().then(
      (value) => { if (active) setResult({ key, attempt, value, error: null }); },
      (e: unknown) => { if (active) setResult({ key, attempt, value: null, error: e instanceof Error ? e.message : fallback }); },
    );
    return () => { active = false; };
  }, [key, load, attempt, fallback]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const mine = key && result?.key === key ? result : null;
  return {
    value: mine?.value ?? null,
    error: mine?.error ?? null,
    loading: !!key && (!mine || mine.attempt !== attempt),
    retry,
  };
}

/** A site's score for a mode, worked out for now; null when the site has left the feed. */
export function useSiteRating(siteId: string | null, mode: TransportMode, api: RatingsApi = ratingsApi): Loaded<SiteRating | null> {
  const load = useCallback(() => api.site(siteId!, mode), [api, siteId, mode]);
  return useKeyed(siteId && `${siteId}|${mode}`, siteId ? load : null, 'Could not load the impact score.');
}

/** The scores of the sites on a route's way, by site. */
export function useRouteRatings(routeId: string | null, api: RatingsApi = ratingsApi): Loaded<ReadonlyMap<string, RouteSiteRating>> {
  const load = useCallback(() => api.route(routeId!), [api, routeId]);
  const loaded = useKeyed(routeId, routeId ? load : null, 'Could not load the impact scores for this route.');
  const byId = useMemo(() => (loaded.value ? new Map(loaded.value.map((r) => [r.siteId, r])) : null), [loaded.value]);
  return { ...loaded, value: byId };
}

/** The numbers behind the scores, loaded while `open`. */
export function useWeights(open: boolean, api: RatingsApi = ratingsApi): Loaded<Record<string, number>> {
  const load = useCallback(() => api.weights(), [api]);
  return useKeyed(open ? 'weights' : null, load, 'Could not load the current values.');
}
