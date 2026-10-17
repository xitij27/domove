import { dist, toXY, type LonLat } from '../detours/geo';
import type { Candidate } from '../detours/planner';
import type { RouteLocation, SavedRoute, TransportMode } from './model';
import { routePlaces } from './routePath';

// Google Maps URLs support at most three waypoints when they open in a mobile browser.
// Keep every saved stop, then use any places left to make Google follow the detour.
const MAX_WAYPOINTS = 3;
const MAX_URL_LENGTH = 2048;
const DETOUR_ANCHOR_M = 15;

const TRAVEL_MODE: Record<TransportMode, string> = {
  car: 'driving',
  bike: 'bicycling',
  pedestrian: 'walking',
};

type IndexedPoint = { index: number; point: LonLat };

/** A universal Google Maps directions URL for the shown way, or null when preserving every saved stop is impossible. */
export function googleMapsDirectionsUrl(route: SavedRoute, shown?: Candidate, baseline: Candidate = shown!): string | null {
  const places = routePlaces(route);
  const stops = places.slice(1, -1);
  if (stops.length > MAX_WAYPOINTS) return null;

  const line = shown?.line ?? places.map(lonLat);
  const direct = baseline?.line ?? line;
  if (line.length < 2 || direct.length < 2) return null;

  const stopPositions = locateStops(line, stops);
  const selected: IndexedPoint[] = stops.map((stop, index) => ({ index: stopPositions[index], point: lonLat(stop) }));
  const sampleEvery = Math.max(1, Math.floor(line.length / 250));
  const candidates = line.flatMap((point, index) => {
    if (index === 0 || index === line.length - 1 || index % sampleEvery !== 0) return [];
    return [{ index, point, distance: distanceFromLine(point, direct) }];
  }).sort((a, b) => b.distance - a.distance);

  for (const candidate of candidates) {
    if (selected.length >= MAX_WAYPOINTS || candidate.distance < DETOUR_ANCHOR_M) break;
    // Avoid several anchors on the same bend, or an anchor beside a saved stop.
    if (selected.every((item) => Math.abs(item.index - candidate.index) > line.length / 12)) selected.push(candidate);
  }

  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', format(lonLat(places[0])));
  url.searchParams.set('destination', format(lonLat(places[places.length - 1])));
  url.searchParams.set('travelmode', TRAVEL_MODE[route.mode]);
  if (selected.length) {
    url.searchParams.set('waypoints', selected.sort((a, b) => a.index - b.index).map(({ point }) => format(point)).join('|'));
  }
  const value = url.toString();
  return value.length <= MAX_URL_LENGTH ? value : null;
}

const lonLat = (place: RouteLocation): LonLat => [place.coordinate.longitude, place.coordinate.latitude];
const format = ([longitude, latitude]: LonLat) => `${latitude},${longitude}`;

/** Approximate each saved stop's position on the routed line, without changing their order. */
function locateStops(line: LonLat[], stops: RouteLocation[]): number[] {
  let after = 0;
  return stops.map((stop) => {
    const point = toXY(lonLat(stop));
    let best = after;
    let bestDistance = Infinity;
    for (let index = after; index < line.length; index++) {
      const distance = dist(point, toXY(line[index]));
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    }
    after = best;
    return best;
  });
}

function distanceFromLine(point: LonLat, line: LonLat[]): number {
  const p = toXY(point);
  let best = Infinity;
  for (let index = 1; index < line.length; index++) {
    const a = toXY(line[index - 1]);
    const b = toXY(line[index]);
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length2 = dx * dx + dy * dy;
    const along = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + along * dx), p[1] - (a[1] + along * dy)));
  }
  return best;
}
