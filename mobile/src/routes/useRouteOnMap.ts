import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RouteOverlay } from '../maps/routeOverlay';
import { routesRepository, type RoutesRepository } from './api';
import type { Coordinate, SavedRoute } from './model';
import { fetchRoutePath, routePlaces, straightPath } from './routePath';

export type RouteOnMap = {
  overlay: RouteOverlay;
  /** The sites on the way; null until the backend answers. */
  siteIds: ReadonlySet<string> | null;
  error: string | null;
  retry: () => void;
};

/** What the map shows for a saved route: its path, and which construction sites lie on the way. */
export function useRouteOnMap(route: SavedRoute | null, repository: RoutesRepository = routesRepository): RouteOnMap | null {
  // Each result names its route, so a late answer for the previous one never shows.
  const [path, setPath] = useState<{ routeId: string; path: Coordinate[] } | null>(null);
  const [sites, setSites] = useState<{ routeId: string; ids: ReadonlySet<string> | null; error: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);

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
        if (active) setSites({ routeId: route.id, ids: null, error: e instanceof Error ? e.message : 'Could not load the construction sites on this route.' });
      },
    );
    return () => { active = false; };
  }, [route, repository, attempt]);

  const retry = useCallback(() => {
    setSites(null);
    setAttempt((count) => count + 1);
  }, []);

  const routed = route && path?.routeId === route.id ? path.path : null;
  // Only a new route or its routed path makes a new overlay, which the maps then bring into view.
  const overlay = useMemo<RouteOverlay | null>(() => route && {
    path: routed ?? straightPath(route),
    start: route.start,
    stops: routePlaces(route).slice(1, -1),
    destination: route.destination,
  }, [route, routed]);

  const found = route && sites?.routeId === route.id ? sites : null;
  return useMemo(() => overlay && { overlay, siteIds: found?.ids ?? null, error: found?.error ?? null, retry }, [overlay, found, retry]);
}
