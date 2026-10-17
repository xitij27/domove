// Each site with what it closes, the road it closes it on, how far the alternatives are, and its
// neighbours. Computed once per data load; only the dates change with the scenario.
import type { MultiPolygon, Polygon } from 'geojson';
import type { Poi, RawSite, Road } from '../data/sources';
import { classifyClosures, isDaytimeOnly, worstKind } from './closures';
import type { ClosureKind } from './closures';
import { toDay } from './days';
import { bboxGap, bboxOf, circle, dist, pointShapeDist, segDist, shapeOf, shapeShapeDist, toLonLat, toXY } from './geo';
import type { BBox, LonLat, Shape, XY } from './geo';
import { bandOf, DEFAULT_SETTINGS, SETTINGS } from './settings';
import type { Band, Settings } from './settings';

export type RoadClass = 'main' | 'secondary' | 'local';
export const ROAD_LABEL: Record<RoadClass, string> = { main: 'main road', secondary: 'through road', local: 'local street' };
export const MAIN_CLASSES = new Set(['Hauptverkehrstraße', 'Verbindungsstrasse zu BAB,B,L,K']);

/** Neighbours are found once out to the furthest clash distance the settings allow; the views keep those within the chosen one. */
export const NEIGHBOUR_RADIUS = SETTINGS['clash.radius'].max;
// A site without a polygon counts as a circle this big, like the obstacles job's 55 m rule for centre points.
const POINT_RADIUS = 25;
// A road's centre line within this distance of a polygon runs through the site…
const ROAD_REACH = 8;
// …and only counts when it does so for this long, so a side-street site touching a main road at the junction stays a side-street site.
const ROAD_ALONG = 30;
const ROAD_ALONG_NAMED = 10;
export const FAR_PAST = toDay('2000-01-01');
export const OPEN_END = toDay('2100-01-01');

export type Nearest = { name: string; detail: string; m: number };
export type Neighbour = { id: string; m: number };
export type Site = {
  id: string;
  status: 'current' | 'planned';
  title: string;
  owner: string;
  district: string;
  kinds: ClosureKind[];
  kind: ClosureKind;
  daytimeOnly: boolean;
  road: RoadClass;
  roadName: string;
  /** Restriction weight × road weight, and the band that puts it in. */
  severity: number;
  band: Band;
  /** As published; start > end when the feed gives a planned site no dates. */
  baseStart: number;
  baseEnd: number;
  /** With the scenario's changes. */
  start: number;
  end: number;
  openEnded: boolean;
  center: LonLat;
  geometry: Polygon | MultiPolygon;
  shape: Shape;
  rail: Nearest;
  fire: Nearest;
  hospital: Nearest;
  hypothetical: boolean;
};
export type SiteInput = RawSite & { kinds?: ClosureKind[]; hypothetical?: boolean };

type PreparedRoad = { name: string; key: string; main: boolean; lines: XY[][]; bbox: BBox };
type PreparedPoi = Poi & { xy: XY };
export type Context = { roads: PreparedRoad[]; stops: PreparedPoi[]; fire: PreparedPoi[]; hospitals: PreparedPoi[] };

/** Street names compared without case, punctuation or the "Str." abbreviation. */
export const streetKey = (name: string): string =>
  name.toLowerCase().replaceAll('ß', 'ss').replace(/\bstr\b\.?/g, 'strasse').replace(/[^\p{L}\d]+/gu, '');

const preparePois = (pois: Poi[]): PreparedPoi[] => pois.map((p) => ({ ...p, xy: toXY(p.at) }));

export function prepareContext(c: { roads: Road[]; stops: Poi[]; fire: Poi[]; hospitals: Poi[] }): Context {
  return {
    roads: c.roads.map((r) => {
      const parts = r.geometry.type === 'LineString' ? [r.geometry.coordinates] : r.geometry.coordinates;
      const lines = parts.map((line) => line.map((p) => toXY(p as LonLat)));
      return { name: r.name, key: streetKey(r.name), main: MAIN_CLASSES.has(r.cls), lines, bbox: bboxOf(lines.flat()) };
    }),
    stops: preparePois(c.stops),
    fire: preparePois(c.fire),
    hospitals: preparePois(c.hospitals),
  };
}

/** Metres of the line that run within `reach` of the shape, sampled every `step` metres. */
export function lengthAlong(line: XY[], shape: Shape, reach: number, step = 5): number {
  let inside = 0;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const len = dist(a, b);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const p: XY = [a[0] + ((b[0] - a[0]) * (k + 0.5)) / n, a[1] + ((b[1] - a[1]) * (k + 0.5)) / n];
      if (pointShapeDist(p, shape) <= reach) inside += len / n;
    }
  }
  return inside;
}

function roadOf(shape: Shape, titleKey: string, roads: PreparedRoad[]): { road: RoadClass; roadName: string } {
  let best: { road: RoadClass; roadName: string } = { road: 'local', roadName: '' };
  for (const r of roads) {
    if (bboxGap(r.bbox, shape.bbox) > ROAD_REACH) continue;
    const along = r.lines.reduce((sum, line) => sum + lengthAlong(line, shape, ROAD_REACH), 0);
    const named = r.key.length > 3 && titleKey.includes(r.key);
    if (along < (named ? ROAD_ALONG_NAMED : ROAD_ALONG)) continue;
    if (r.main) return { road: 'main', roadName: r.name };
    if (best.road === 'local') best = { road: 'secondary', roadName: r.name };
  }
  return best;
}

function nearest(shape: Shape, pois: PreparedPoi[]): Nearest {
  let best: Nearest = { name: '', detail: '', m: Infinity };
  for (const p of pois) {
    const m = pointShapeDist(p.xy, shape);
    if (m < best.m) best = { name: p.name, detail: p.detail, m };
  }
  return best;
}

function datesOf(raw: RawSite): { start: number; end: number; openEnded: boolean } {
  if (!raw.startsOn && raw.status === 'planned') return { start: OPEN_END + 1, end: OPEN_END, openEnded: false }; // never active (#12)
  const start = raw.startsOn ? toDay(raw.startsOn) : FAR_PAST;
  const end = raw.endsOn ? toDay(raw.endsOn) : raw.status === 'current' ? OPEN_END : start;
  // the feed writes 2999-12-31 for works without an end
  return { start, end: Math.max(start, Math.min(end, OPEN_END)), openEnded: end >= OPEN_END };
}

/** Guard malformed remote arrays before projecting them. Analytical evidence keeps the raw geometry. */
function drawableGeometry(geometry: Polygon | MultiPolygon | null): geometry is Polygon | MultiPolygon {
  if (!geometry) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return Array.isArray(polygons) && polygons.length > 0 && polygons.every((rings) =>
    Array.isArray(rings) && rings.length > 0 && rings.every((ring) =>
      Array.isArray(ring) && ring.length >= 4 && ring.every((p) =>
        Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite))));
}

export function buildSites(inputs: SiteInput[], ctx: Context): Site[] {
  return inputs.map((raw) => {
    const geometry: Polygon | MultiPolygon = drawableGeometry(raw.geometry) ? raw.geometry : {
      type: 'Polygon',
      coordinates: [circle(toXY(raw.center), POINT_RADIUS).map(toLonLat)],
    };
    const shape = shapeOf(geometry);
    const kinds = raw.kinds ?? classifyClosures(raw.title);
    const { road, roadName } = roadOf(shape, streetKey(raw.title), ctx.roads);
    const { start, end, openEnded } = datesOf(raw);
    return {
      id: raw.id,
      status: raw.status,
      title: raw.title,
      owner: raw.owner,
      district: raw.district,
      kinds,
      ...weights(kinds, road, DEFAULT_SETTINGS),
      daytimeOnly: isDaytimeOnly(raw.title),
      road,
      roadName,
      baseStart: start,
      baseEnd: end,
      start,
      end,
      openEnded,
      center: raw.center,
      geometry,
      shape,
      rail: nearest(shape, ctx.stops),
      fire: nearest(shape, ctx.fire),
      hospital: nearest(shape, ctx.hospitals),
      hypothetical: !!raw.hypothetical,
    };
  });
}

function weights(kinds: ClosureKind[], road: RoadClass, s: Settings): Pick<Site, 'kind' | 'severity' | 'band'> {
  const kind = worstKind(kinds, s);
  const severity = s[`weight.${kind}`] * s[`road.${road}`];
  return { kind, severity, band: bandOf(severity, s) };
}

/** The sites with their kind, severity and band under other weights; cheap, unlike building them. */
export const weigh = (sites: Site[], s: Settings): Site[] => sites.map((site) => ({ ...site, ...weights(site.kinds, site.road, s) }));

/** Every pair of sites within `radius` metres of each other, both ways round. */
export function findNeighbours(sites: Pick<Site, 'id' | 'shape'>[], radius = NEIGHBOUR_RADIUS): Map<string, Neighbour[]> {
  const out = new Map<string, Neighbour[]>(sites.map((s) => [s.id, []]));
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      const [a, b] = [sites[i], sites[j]];
      if (bboxGap(a.shape.bbox, b.shape.bbox) > radius) continue;
      const m = shapeShapeDist(a.shape, b.shape);
      if (m > radius) continue;
      out.get(a.id)!.push({ id: b.id, m });
      out.get(b.id)!.push({ id: a.id, m });
    }
  }
  return out;
}

/** The closest main or through road to a point, for naming a place the planner clicked. */
export function nearestRoad(at: LonLat, ctx: Context): { name: string; m: number } | null {
  const p = toXY(at);
  let best: { name: string; m: number } | null = null;
  for (const r of ctx.roads) {
    if (r.bbox[0] - p[0] > 100 || p[0] - r.bbox[2] > 100 || r.bbox[1] - p[1] > 100 || p[1] - r.bbox[3] > 100) continue;
    for (const line of r.lines) {
      for (let i = 1; i < line.length; i++) {
        const m = segDist(p, line[i - 1], line[i]);
        if (!best || m < best.m) best = { name: r.name, m };
      }
    }
  }
  return best;
}
