import { useEffect, useMemo, useState } from 'react';
import type { Site } from '../sites';
import { routesRepository, type RoutesRepository } from './api';
import type { Coordinate, RouteLocation, SavedRoute } from './model';
import { fetchRoutePath, routePlaces } from './routePath';

/** What a map draws for the shown route: its line, and the start, stops and destination it passes. */
export type RouteLine = { path: Coordinate[]; places: RouteLocation[] };
/** `sites` are the construction sites on the route; null while they load or when loading failed. */
export type RouteView = RouteLine & { sites: Site[] | null; error: string | null };

/** Room the map overlay takes when a route is fitted: chips and controls above, the route card below. */
export const ROUTE_PADDING = { top: 170, right: 50, bottom: 170, left: 50 };

/** Start green, stops grey, destination blue. */
export function placeColor(index: number, count: number) {
  return index === 0 ? '#2e7d32' : index === count - 1 ? '#1565c0' : '#757575';
}

export function obstacleSummary({ sites, error }: RouteView) {
  if (error) return error;
  if (!sites) return 'Checking for construction sites…';
  if (sites.length === 0) return 'No construction sites on the way.';
  return `${sites.length} construction ${sites.length === 1 ? 'site' : 'sites'} on the way.`;
}

type Loaded = { routeId: string; path?: Coordinate[]; sites?: Site[]; error?: string };

/** The shown route's line, straight until the router answers, and the construction sites on it. */
export function useRouteView(route: SavedRoute | null, repository: RoutesRepository = routesRepository): RouteView | null {
  // Tagged with its route, so switching routes never shows the previous route's line or sites.
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!route) return;
    let active = true;
    const update = (patch: Omit<Loaded, 'routeId'>) => {
      if (active) setLoaded((current) => ({ ...(current?.routeId === route.id ? current : null), routeId: route.id, ...patch }));
    };
    repository.listObstacles(route.id).then(
      (obstacles) => update({ sites: obstacles.flatMap((obstacle) => (obstacle.site ? [obstacle.site] : [])), error: undefined }),
      (e: unknown) => update({ error: e instanceof Error ? e.message : 'Could not load the construction sites on this route.' }),
    );
    fetchRoutePath(route).then((path) => update({ path }), () => { /* the straight line stays */ });
    return () => { active = false; };
  }, [route, repository]);

  // Stable while nothing loads, so the maps refit only when the line itself changes.
  const places = useMemo(() => (route ? routePlaces(route) : []), [route]);
  const straight = useMemo(() => places.map((place) => place.coordinate), [places]);
  return useMemo(() => {
    if (!route) return null;
    const mine = loaded?.routeId === route.id ? loaded : undefined;
    return { places, path: mine?.path ?? straight, sites: mine?.sites ?? null, error: mine?.error ?? null };
  }, [route, places, straight, loaded]);
}
