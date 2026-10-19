import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Plan } from '../detours/planner';
import { planSiteIds } from '../detours/text';
import { useDetours, type DetourState } from '../detours/useDetours';
import { strings } from '../i18n';
import { routePoints, type RouteOverlay } from '../maps/routeOverlay';
import { routesRepository, type RoutesRepository } from './api';
import type { Coordinate, SavedRoute } from './model';
import { fetchRoutePath, routePlaces, straightPath } from './routePath';

export type RouteOnMap = {
  overlay: RouteOverlay;
  /** The sites to show: those the backend's job found on the way, and those any path drawn meets; null until either answers. */
  siteIds: ReadonlySet<string> | null;
  error: string | null;
  retry: () => void;
  /** Looking for a way around construction, and what it found. */
  detours: DetourState;
  retryDetours: () => void;
  /** The way shown, as an index into the plan's options. */
  chosen: number;
  choose: (index: number) => void;
  /** Picks the overlay's alternative at this index. */
  chooseAlternative: (index: number) => void;
};

/**
 * What the map shows for a saved route: its path, which construction sites lie on the way, and the ways around them.
 * Until the way around is found (or when it can't be), the path is the router's line the obstacles job matched.
 */
export function useRouteOnMap(route: SavedRoute | null, repository: RoutesRepository = routesRepository): RouteOnMap | null {
  // Each result names its route, so a late answer for the previous one never shows.
  const [path, setPath] = useState<{ routeId: string; path: Coordinate[] } | null>(null);
  const [sites, setSites] = useState<{ routeId: string; ids: ReadonlySet<string> | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { state: detours, retry: retryDetours } = useDetours(route);
  const [chosen, setChosen] = useState<{ plan: Plan; index: number } | null>(null);

  useEffect(() => {
    if (!route) return;
    let active = true;
    fetchRoutePath(route).then(
      (routed) => { if (active) setPath({ routeId: route.id, path: routed }); },
      () => {}, // the straight line stays
    );
    return () => { active = false; };
  }, [route]);

  useEffect(() => {
    if (!route) return;
    let active = true;
    repository.obstacleSiteIds(route.id).then(
      (ids) => { if (active) setSites({ routeId: route.id, ids: new Set(ids), error: null }); },
      (e: unknown) => {
        if (active) setSites({ routeId: route.id, ids: null, error: e instanceof Error ? e.message : strings().errors.routeSitesFailed });
      },
    );
    return () => { active = false; };
  }, [route, repository, attempt]);

  const retry = useCallback(() => {
    setSites(null);
    setAttempt((count) => count + 1);
  }, []);

  const plan = detours?.status === 'ready' ? detours.plan : null;
  // a new plan starts on its recommendation
  const index = plan && chosen?.plan === plan ? chosen.index : 0;
  const choose = useCallback((next: number) => { if (plan) setChosen({ plan, index: next }); }, [plan]);
  // the alternatives are the options without the one shown
  const chooseAlternative = useCallback((alternative: number) => choose(alternative < index ? alternative : alternative + 1), [choose, index]);

  const routed = route && path?.routeId === route.id ? path.path : null;
  const ways = useMemo(() => plan?.options.map((option) => option.line.map(([longitude, latitude]) => ({ latitude, longitude }))) ?? null, [plan]);
  const fallback = useMemo(() => route && (routed ?? straightPath(route)), [route, routed]);
  const drawn = useMemo(() => ways ?? (fallback ? [fallback] : null), [ways, fallback]);
  // Only a new route, its routed path or its ways around bring it into view again; picking another way doesn't.
  const fit = useMemo(() => route && drawn && routePoints(drawn, routePlaces(route)), [route, drawn]);
  const overlay = useMemo<RouteOverlay | null>(() => route && drawn && fit && {
    path: drawn[index] ?? drawn[0],
    alternatives: drawn.filter((_, i) => i !== index),
    start: route.start,
    stops: routePlaces(route).slice(1, -1),
    destination: route.destination,
    fit,
  }, [route, drawn, fit, index]);

  const found = route && sites?.routeId === route.id ? sites : null;
  const known = found?.ids ?? null;
  const planned = useMemo(() => (plan ? planSiteIds(plan) : null), [plan]);
  const siteIds = useMemo(() => (known || planned ? new Set([...(known ?? []), ...(planned ?? [])]) : null), [known, planned]);
  return useMemo(() => overlay && detours && {
    overlay, siteIds, error: found?.error ?? null, retry, detours, retryDetours, chosen: index, choose, chooseAlternative,
  }, [overlay, siteIds, found, retry, detours, retryDetours, index, choose, chooseAlternative]);
}
