// Routes and reach per user group on the public FOSSGIS Valhalla server, around the closures of a chosen day.
import { area, difference, feature, featureCollection, intersect, pointOnFeature } from '@turf/turf';
import type { MultiPolygon, Polygon } from 'geojson';
import { strings } from '../i18n';
import { IMPACTS } from '../model/closures';
import type { ClosureKind, Mode } from '../model/closures';
import { bboxGap, bboxOf, dist, pointInShape, pointShapeDist, shapeOf, toLonLat, toXY } from '../model/geo';
import type { LonLat, XY } from '../model/geo';
import type { Site } from '../model/sites';
import { decodePolyline } from './polyline';

const BASE = 'https://valhalla1.openstreetmap.de';
type Costing = 'auto' | 'truck' | 'bicycle' | 'pedestrian';
export type Group = 'commuter' | 'logistics' | 'emergency' | 'cyclist' | 'pedestrian';

const blockedFor = (mode: Mode) => (kinds: ClosureKind[]) => kinds.some((k) => IMPACTS[k][mode].effect === 'blocked');

// Each group's name and what it assumes are in the i18n strings (routes.groups).
export const GROUPS: Record<Group, { costing: Costing; mode: Mode; blocks: (kinds: ClosureKind[]) => boolean }> = {
  commuter: { costing: 'auto', mode: 'car', blocks: blockedFor('car') },
  // our assumption: lorries also avoid half closures, closed carriageways and narrowings
  logistics: {
    costing: 'truck', mode: 'car',
    blocks: (kinds) => blockedFor('car')(kinds) || kinds.some((k) => k === 'half' || k === 'carriageway' || k === 'narrowing'),
  },
  // blue-light vehicles may pass one-way rules and narrowings
  emergency: { costing: 'auto', mode: 'car', blocks: (kinds) => kinds.includes('full') },
  cyclist: { costing: 'bicycle', mode: 'bike', blocks: blockedFor('bike') },
  pedestrian: { costing: 'pedestrian', mode: 'walk', blocks: blockedFor('walk') },
};

// The public server takes at most 100 vertices and 10 km of outline in exclude_polygons:
// 19 squares of 30 m (5 vertices, 120 m each) stay inside both.
export const MAX_CUTS = 19;
const CUT_SIDE = 30;
const REACH = 5; // m: sites grown to reach the road's centre line, #12's buffer_m
// More than this much path inside a site means the path uses its street; crossing a 10 m-wide side-street site at a junction is exactly 20 m.
const ALONG = 20;
const NO_ROUTE = 442;

export class RouterError extends Error {
  constructor(message: string, readonly code: number | null = null) {
    super(message);
  }
}

let queue: Promise<unknown> = Promise.resolve();
let lastAt = 0;
const cache = new Map<string, Promise<unknown>>();

// FOSSGIS runs the server on donations: one request a second, as the obstacles job does with their OSRM.
function call(path: string, body: object): Promise<unknown> {
  const key = path + JSON.stringify(body);
  const cached = cache.get(key);
  if (cached) return cached;
  const run = queue.then(async () => {
    const wait = lastAt + 1000 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastAt = Date.now();
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new RouterError(strings().routes.unreachable);
    }
    const json = (await res.json().catch(() => null)) as { error?: string; error_code?: number } | null;
    if (!res.ok) throw new RouterError(json?.error ?? `Routing server: HTTP ${res.status}`, json?.error_code ?? null);
    return json;
  });
  queue = run.catch(() => undefined);
  cache.set(key, run);
  run.catch(() => cache.delete(key));
  return run;
}

export type Leg = { line: LonLat[]; seconds: number; meters: number };

export async function route(costing: Costing, from: LonLat, to: LonLat, cuts: LonLat[][]): Promise<Leg> {
  const json = (await call('/route', {
    locations: [from, to].map(([lon, lat]) => ({ lon, lat })),
    costing,
    directions_type: 'none',
    units: 'kilometers',
    ...(cuts.length ? { exclude_polygons: cuts } : {}),
  })) as { trip?: { legs?: { shape?: unknown }[]; summary?: { time?: unknown; length?: unknown } } } | null;
  const shape = json?.trip?.legs?.[0]?.shape;
  const { time, length } = json?.trip?.summary ?? {};
  if (typeof shape !== 'string' || typeof time !== 'number' || typeof length !== 'number') throw new RouterError(strings().routes.unexpected);
  return { line: decodePolyline(shape), seconds: time, meters: length * 1000 };
}

const isPolygonal = (g: unknown): g is Polygon | MultiPolygon =>
  !!g && typeof g === 'object' && ((g as Polygon).type === 'Polygon' || (g as MultiPolygon).type === 'MultiPolygon');

export async function isochrone(costing: Costing, at: LonLat, minutes: number, cuts: LonLat[][]): Promise<Polygon | MultiPolygon> {
  const json = (await call('/isochrone', {
    locations: [{ lon: at[0], lat: at[1] }],
    costing,
    contours: [{ time: minutes }],
    polygons: true,
    ...(cuts.length ? { exclude_polygons: cuts } : {}),
  })) as { features?: { geometry?: unknown }[] } | null;
  const geometry = json?.features?.find((f) => isPolygonal(f.geometry))?.geometry;
  if (!isPolygonal(geometry)) throw new RouterError(strings().routes.unexpected);
  return geometry;
}

/** A closed 30 m square around the point, to exclude the road there. */
export function cutSquare(at: LonLat, side = CUT_SIDE): LonLat[] {
  const [x, y] = toXY(at);
  const h = side / 2;
  return ([[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h], [x - h, y - h]] as XY[]).map(toLonLat);
}

function pointAt(pts: XY[], d: number): XY {
  let travelled = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]);
    if (travelled + len >= d && len > 0) {
      const t = (d - travelled) / len;
      return [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])];
    }
    travelled += len;
  }
  return pts[pts.length - 1];
}

export type PathHit = { site: Site; along: number; mid: LonLat };

/** Sites whose street the path uses for more than 20 m, with the middle of its longest stretch inside each. */
export function sitesAlongPath(line: LonLat[], sites: Site[], step = 5): PathHit[] {
  const pts = line.map(toXY);
  if (pts.length < 2) return [];
  const box = bboxOf(pts);
  const tracks = sites
    .filter((s) => bboxGap(s.shape.bbox, box) <= REACH)
    .map((site) => ({ site, along: 0, runStart: -1, last: -1, best: [0, -1] as [number, number] }));
  const close = (t: (typeof tracks)[number]) => {
    if (t.runStart >= 0 && t.last - t.runStart > t.best[1] - t.best[0]) t.best = [t.runStart, t.last];
    t.runStart = -1;
  };
  let travelled = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const len = dist(a, b);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const p: XY = [a[0] + ((b[0] - a[0]) * (k + 0.5)) / n, a[1] + ((b[1] - a[1]) * (k + 0.5)) / n];
      const at = travelled + (len * (k + 0.5)) / n;
      for (const t of tracks) {
        const bb = t.site.shape.bbox;
        const near = p[0] >= bb[0] - REACH && p[0] <= bb[2] + REACH && p[1] >= bb[1] - REACH && p[1] <= bb[3] + REACH;
        if (near && pointShapeDist(p, t.site.shape) <= REACH) {
          t.along += len / n;
          if (t.runStart < 0) t.runStart = at;
          t.last = at;
        } else close(t);
      }
    }
    travelled += len;
  }
  return tracks.flatMap((t) => {
    close(t);
    return t.along > ALONG ? [{ site: t.site, along: t.along, mid: toLonLat(pointAt(pts, (t.best[0] + t.best[1]) / 2)) }] : [];
  });
}

/** Extra seconds a group loses passing a site it can go through; #12 takes the highest penalty, not the sum. */
export function penaltyFor(site: Site, group: Group): number {
  const g = GROUPS[group];
  if (g.blocks(site.kinds)) return 0;
  return Math.max(0, ...site.kinds.map((k) => IMPACTS[k][g.mode]).filter((i) => i.effect === 'slowed').map((i) => i.penaltyS));
}

export type Detour = {
  normal: Leg;
  aware: Leg;
  /** aware + penalties − normal */
  extraS: number;
  penaltyS: number;
  avoided: Site[];
  /** Blocking sites the best route still uses: no way around, or past the router's limit. */
  blockedOnRoute: Site[];
  slowedOnRoute: Site[];
  limitReached: boolean;
};

/**
 * The normal route, then the same trip around the works that block this group on that day: exclude a square where
 * the path runs through each blocking site, ask again, and repeat for sites the new path finds (at most 3 rounds).
 */
export async function planDetour(group: Group, from: LonLat, to: LonLat, sites: Site[]): Promise<Detour> {
  const g = GROUPS[group];
  const blocking = sites.filter((s) => g.blocks(s.kinds));
  const ends = [toXY(from), toXY(to)];
  const normal = await route(g.costing, from, to, []);
  const cuts: LonLat[][] = [];
  const avoided = new Map<string, Site>();
  const stuck = new Set<string>();
  let aware = normal;
  let limitReached = false;
  for (let round = 0; round < 3; round++) {
    const added: Site[] = [];
    for (const hit of sitesAlongPath(aware.line, blocking)) {
      if (avoided.has(hit.site.id) || stuck.has(hit.site.id)) continue;
      if (ends.some((p) => pointShapeDist(p, hit.site.shape) <= REACH)) {
        stuck.add(hit.site.id); // the trip starts or ends inside it
      } else if (cuts.length >= MAX_CUTS) {
        limitReached = true;
      } else {
        cuts.push(cutSquare(hit.mid));
        avoided.set(hit.site.id, hit.site);
        added.push(hit.site);
      }
    }
    if (!added.length) break;
    try {
      aware = await route(g.costing, from, to, cuts);
    } catch (e) {
      if (!(e instanceof RouterError) || e.code !== NO_ROUTE) throw e;
      // no way around this round's sites: keep the last route and say so
      cuts.splice(cuts.length - added.length);
      for (const s of added) {
        avoided.delete(s.id);
        stuck.add(s.id);
      }
      break;
    }
  }
  const blockedOnRoute = sitesAlongPath(aware.line, blocking).map((h) => h.site);
  for (const s of blockedOnRoute) avoided.delete(s.id);
  const slowedOnRoute = sitesAlongPath(aware.line, sites.filter((s) => penaltyFor(s, group) > 0)).map((h) => h.site);
  const penaltyS = slowedOnRoute.reduce((sum, s) => sum + penaltyFor(s, group), 0);
  return { normal, aware, extraS: aware.seconds + penaltyS - normal.seconds, penaltyS, avoided: [...avoided.values()], blockedOnRoute, slowedOnRoute, limitReached };
}

export type Coverage = {
  normal: Polygon | MultiPolygon;
  reduced: Polygon | MultiPolygon;
  lost: Polygon | MultiPolygon | null;
  normalKm2: number;
  lostKm2: number;
  residents: number;
  used: Site[];
  skipped: number;
};

const MIN_LOST_PART = 5_000; // m²: smaller differences are noise between two generalised isochrones

/**
 * What a fire and rescue station reaches within `minutes`, without and with the day's full closures inside that area
 * (the 19 most severe, nearest first, because of the router's limit), and roughly how many residents fall outside.
 */
export async function emergencyCoverage(
  station: LonLat, minutes: number, sites: Site[], districts: { geometry: Polygon | MultiPolygon; residents: number }[],
): Promise<Coverage> {
  const normal = await isochrone('auto', station, minutes, []);
  const reach = shapeOf(normal);
  const here = toXY(station);
  const inside = sites
    .filter((s) => GROUPS.emergency.blocks(s.kinds) && pointInShape(toXY(s.center), reach))
    .sort((a, b) => b.severity - a.severity || dist(toXY(a.center), here) - dist(toXY(b.center), here));
  const used = inside.slice(0, MAX_CUTS);
  const reduced = used.length
    ? await isochrone('auto', station, minutes, used.map((s) => cutSquare(pointOnFeature(s.geometry).geometry.coordinates as LonLat)))
    : normal;
  const diff = difference(featureCollection([feature(normal), feature(reduced)]))?.geometry ?? null;
  const parts = !diff ? [] : diff.type === 'Polygon' ? [diff.coordinates] : diff.coordinates;
  const kept = parts.filter((p) => area({ type: 'Polygon', coordinates: p }) >= MIN_LOST_PART);
  const lost: MultiPolygon | null = kept.length ? { type: 'MultiPolygon', coordinates: kept } : null;
  const residents = !lost ? 0 : districts.reduce((sum, d) => {
    const part = intersect(featureCollection([feature(lost), feature(d.geometry)]));
    return part ? sum + (area(part) / area(d.geometry)) * d.residents : sum;
  }, 0);
  return {
    normal, reduced, lost,
    normalKm2: area(normal) / 1e6,
    lostKm2: lost ? area(lost) / 1e6 : 0,
    residents, used, skipped: inside.length - used.length,
  };
}
