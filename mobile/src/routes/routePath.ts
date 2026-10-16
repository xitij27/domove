import type { Coordinate, RouteLocation, SavedRoute } from './model';

/** Start, stops in order, destination. */
export function routePlaces(route: SavedRoute): RouteLocation[] {
  const stops = [...route.waypoints].sort((a, b) => a.sequence - b.sequence);
  return [route.start, ...stops, route.destination];
}

/** Mirrors private.route_requests, so the line drawn is the one the obstacles were matched against. */
export function routePathUrl(route: SavedRoute): string {
  const profile = route.mode === 'pedestrian' ? 'foot' : route.mode;
  const coords = routePlaces(route)
    .map((place) => `${place.coordinate.longitude},${place.coordinate.latitude}`)
    .join(';');
  return `https://routing.openstreetmap.de/routed-${profile}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
}

type OsrmResponse = {
  code?: unknown;
  routes?: { geometry?: { coordinates?: unknown } }[];
};

/** The router's path. Throws when unusable, so the caller can keep the straight line. */
export async function fetchRoutePath(route: SavedRoute, fetchImpl: typeof fetch = fetch): Promise<Coordinate[]> {
  const res = await fetchImpl(routePathUrl(route));
  if (!res.ok) throw new Error(`Routing: HTTP ${res.status}`);
  const body = (await res.json()) as OsrmResponse;
  if (body.code !== 'Ok') throw new Error('Could not route this journey right now.');
  const pairs = body.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(pairs) || pairs.length === 0) throw new Error('Could not route this journey right now.');
  const path: Coordinate[] = [];
  for (const pair of pairs) {
    if (!Array.isArray(pair) || typeof pair[0] !== 'number' || typeof pair[1] !== 'number') {
      throw new Error('Could not route this journey right now.');
    }
    path.push({ longitude: pair[0], latitude: pair[1] });
  }
  return path;
}

/** Straight line through start, stops in order and destination. Shown until routing answers, and when it fails. */
export function straightPath(route: SavedRoute): Coordinate[] {
  return routePlaces(route).map((place) => place.coordinate);
}
